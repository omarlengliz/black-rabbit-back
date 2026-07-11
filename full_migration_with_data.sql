-- =========================================================================
-- BLACK RABBIT FULL DATABASE SETUP (SCHEMA + DATA)
-- Run this entire script in your new Supabase Project's SQL Editor
-- =========================================================================

-- Grant schema and table permissions first (fixes permission denied errors)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- -------------------------------------------------------------------------
-- PART 1: SCHEMA (From Migrations)
-- -------------------------------------------------------------------------

-- Create enums (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE public.order_status AS ENUM ('pending', 'preparing', 'completed', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'waiter');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reservation_type') THEN
    CREATE TYPE public.reservation_type AS ENUM ('normal', 'anniversaire');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reservation_status') THEN
    CREATE TYPE public.reservation_status AS ENUM ('pending', 'confirmed', 'checked_in', 'expired', 'cancelled');
  END IF;
END $$;

-- Categories table
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INT DEFAULT 0,
  is_hidden BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Menu items table
CREATE TABLE IF NOT EXISTS public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price NUMERIC(10,2) NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  image_url TEXT DEFAULT '',
  is_available BOOLEAN DEFAULT true,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  sort_order INT DEFAULT 0,
  variants JSONB DEFAULT '[]'::jsonb,
  options JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Menu item extras
CREATE TABLE IF NOT EXISTS public.menu_item_extras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tables (restaurant tables)
CREATE TABLE IF NOT EXISTS public.tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number INT NOT NULL UNIQUE,
  qr_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex') UNIQUE,
  is_active BOOLEAN DEFAULT true,
  min_seats INT NOT NULL DEFAULT 2,
  max_seats INT NOT NULL DEFAULT 4,
  x_position DOUBLE PRECISION DEFAULT 50,
  y_position DOUBLE PRECISION DEFAULT 50,
  zone TEXT DEFAULT 'interior',
  width DOUBLE PRECISION DEFAULT 6,
  height DOUBLE PRECISION DEFAULT 6,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Orders
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID REFERENCES public.tables(id) ON DELETE SET NULL,
  table_number INT NOT NULL,
  status order_status DEFAULT 'pending',
  total NUMERIC(10,2) NOT NULL,
  notes TEXT,
  tracking_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Order items
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
  menu_item_name TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  selected_extras JSONB DEFAULT '[]'::jsonb
);

-- Reservations
CREATE TABLE IF NOT EXISTS public.reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID REFERENCES public.tables(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  num_guests INT NOT NULL,
  reservation_type public.reservation_type NOT NULL DEFAULT 'normal',
  reservation_date TIMESTAMPTZ NOT NULL,
  status public.reservation_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Delivery Orders
CREATE TABLE IF NOT EXISTS public.delivery_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC NOT NULL,
  delivery_fee NUMERIC NOT NULL DEFAULT 3,
  total NUMERIC NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'delivering', 'delivered', 'cancelled')),
  tracking_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User roles (security)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- App settings
CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Push Subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Push Logs
CREATE TABLE IF NOT EXISTS public.push_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- -------------------------------------------------------------------------
-- PART 2: RLS AND FUNCTIONS
-- -------------------------------------------------------------------------

-- Enable RLS
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_extras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_logs ENABLE ROW LEVEL SECURITY;

-- Security definer functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'waiter'))
$$;

-- RLS Policies
CREATE POLICY "Anyone can view categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Admins can manage categories" ON public.categories FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view available menu items" ON public.menu_items FOR SELECT USING (true);
CREATE POLICY "Admins can manage menu items" ON public.menu_items FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view menu item extras" ON public.menu_item_extras FOR SELECT USING (true);
CREATE POLICY "Admins can manage menu item extras" ON public.menu_item_extras FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view tables" ON public.tables FOR SELECT USING (true);
CREATE POLICY "Admins can manage tables" ON public.tables FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can create orders" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Staff can view orders" ON public.orders FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update orders" ON public.orders FOR UPDATE USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can delete orders" ON public.orders FOR DELETE USING (public.is_staff(auth.uid()));

CREATE POLICY "Anyone can add order items" ON public.order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Staff can view order items" ON public.order_items FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update order items" ON public.order_items FOR UPDATE USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can delete order items" ON public.order_items FOR DELETE USING (public.is_staff(auth.uid()));

CREATE POLICY "Anyone can create reservations" ON public.reservations FOR INSERT WITH CHECK (true);
CREATE POLICY "Staff can view reservations" ON public.reservations FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update reservations" ON public.reservations FOR UPDATE USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can delete reservations" ON public.reservations FOR DELETE USING (public.is_staff(auth.uid()));

CREATE POLICY "Anyone can create delivery orders" ON public.delivery_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Staff can view delivery orders" ON public.delivery_orders FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update delivery orders" ON public.delivery_orders FOR UPDATE USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can delete delivery orders" ON public.delivery_orders FOR DELETE USING (public.is_staff(auth.uid()));

CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Admins can manage settings" ON public.app_settings FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can manage own push subscriptions" ON public.push_subscriptions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role reads all push subscriptions" ON public.push_subscriptions FOR SELECT TO service_role USING (true);
CREATE POLICY "Service role deletes stale push subscriptions" ON public.push_subscriptions FOR DELETE TO service_role USING (true);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_menu_items_updated_at BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_reservations_updated_at BEFORE UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_delivery_orders_updated_at BEFORE UPDATE ON public.delivery_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_app_settings_updated_at BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_orders;

-- Storage
INSERT INTO storage.buckets (id, name, public) VALUES ('menu-images', 'menu-images', true) ON CONFLICT (id) DO NOTHING;

-- Set cache-control on menu-images bucket for CDN edge caching
UPDATE storage.buckets SET public = true WHERE id = 'menu-images';

DROP POLICY IF EXISTS "Anyone can view menu images" ON storage.objects;
CREATE POLICY "Anyone can view menu images" ON storage.objects FOR SELECT USING (bucket_id = 'menu-images');

DROP POLICY IF EXISTS "Admins can upload menu images" ON storage.objects;
CREATE POLICY "Admins can upload menu images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'menu-images' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update menu images" ON storage.objects;
CREATE POLICY "Admins can update menu images" ON storage.objects FOR UPDATE USING (bucket_id = 'menu-images' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete menu images" ON storage.objects;
CREATE POLICY "Admins can delete menu images" ON storage.objects FOR DELETE USING (bucket_id = 'menu-images' AND public.has_role(auth.uid(), 'admin'));

-- Ensure tracking_code column exists on existing tables (idempotent)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_code TEXT;
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS tracking_code TEXT;

-- ─── PERFORMANCE: Indexes ───
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_table_id ON public.orders(table_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category_id ON public.menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_available_category ON public.menu_items(is_available, category_id) WHERE is_available = true;
CREATE INDEX IF NOT EXISTS idx_menu_items_featured ON public.menu_items(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_delivery_orders_status ON public.delivery_orders(status);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_created_at ON public.delivery_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON public.reservations(reservation_date);
CREATE INDEX IF NOT EXISTS idx_reservations_table_id ON public.reservations(table_id);
CREATE INDEX IF NOT EXISTS idx_push_logs_tag ON public.push_logs(tag);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);

-- Set storage cache-control for image CDN caching (reduces repeated image egress)
UPDATE storage.objects SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"cacheControl": "public, max-age=31536000"}'::jsonb WHERE bucket_id = 'menu-images';

-- -------------------------------------------------------------------------
-- PART 3: DATA INSERTS
-- -------------------------------------------------------------------------

-- Categories
INSERT INTO "public"."categories" ("id", "name", "sort_order", "is_hidden", "created_at") VALUES 
('a1000000-0000-0000-0000-000000000002', 'Les Petits Déjeuner', 2, false, '2026-03-25 02:02:06.086382+00'),
('a1000000-0000-0000-0000-000000000003', 'Hot Drinks', 3, false, '2026-03-25 02:02:06.086382+00'),
('a1000000-0000-0000-0000-000000000005', 'Frappuccino', 5, false, '2026-03-25 02:02:06.086382+00'),
('a1000000-0000-0000-0000-000000000006', 'Ice Coffee', 6, false, '2026-03-25 02:02:06.086382+00'),
('a1000000-0000-0000-0000-000000000007', 'Mojitos', 7, false, '2026-03-25 02:02:06.086382+00'),
('a1000000-0000-0000-0000-000000000008', 'Juices', 8, false, '2026-03-25 02:02:06.086382+00'),
('a1000000-0000-0000-0000-000000000009', 'Milkshake', 9, false, '2026-03-25 02:02:06.086382+00'),
('a1000000-0000-0000-0000-000000000010', 'Smoothies', 10, false, '2026-03-25 02:02:06.086382+00'),
('a1000000-0000-0000-0000-000000000011', 'Soft Drinks', 11, false, '2026-03-25 02:02:06.086382+00'),
('a1000000-0000-0000-0000-000000000012', 'Extra Drinks', 12, false, '2026-03-25 02:02:06.086382+00'),
('a1000000-0000-0000-0000-000000000013', 'Crêpes & Gaufres Salées', 13, false, '2026-03-25 02:02:06.086382+00'),
('a1000000-0000-0000-0000-000000000014', 'Sandwiches', 14, false, '2026-03-25 02:02:06.086382+00'),
('a1000000-0000-0000-0000-000000000015', 'Tacos', 15, false, '2026-03-25 02:02:06.086382+00'),
('a1000000-0000-0000-0000-000000000016', 'Specials Salés', 16, false, '2026-03-25 02:02:06.086382+00'),
('a1000000-0000-0000-0000-000000000017', 'Crêpes & Gaufres Sucrées', 17, false, '2026-03-25 02:02:06.086382+00'),
('a1000000-0000-0000-0000-000000000018', 'Big Bubbles', 18, false, '2026-03-25 02:02:06.086382+00'),
('a1000000-0000-0000-0000-000000000019', 'Tagliatelle', 19, false, '2026-03-25 02:02:06.086382+00'),
('a1000000-0000-0000-0000-000000000020', 'Box', 20, false, '2026-03-25 02:02:06.086382+00'),
('a1000000-0000-0000-0000-000000000021', 'Tiramisu Ball', 21, false, '2026-03-25 02:02:06.086382+00'),
('a1000000-0000-0000-0000-000000000022', 'Black Rabbit Spécialité', 22, false, '2026-03-25 02:02:06.086382+00');

-- Menu Items
INSERT INTO "public"."menu_items" ("id", "name", "description", "price", "category_id", "image_url", "is_available", "is_featured", "sort_order", "variants", "options") VALUES 
('0090d588-313b-45e3-b91e-d0fc7899926d', 'Cappuccino ', '', '5.00', 'a1000000-0000-0000-0000-000000000003', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1779461668947-6rvhs0v.jpeg', true, false, 0, '[]', '[]'), 
('0127c875-c0b6-4e67-b6a7-382ef2da35b5', 'Eau Plate', null, '3.50', 'a1000000-0000-0000-0000-000000000011', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/eau.jpeg', true, false, 1, '[]', '[]'), 
('016963a6-0964-451d-87b0-8e3cbc7cc5ed', 'Milkshakes', '', '11.00', 'a1000000-0000-0000-0000-000000000009', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778620005102-pfda9j.jpeg', true, true, 1, '[]', '["Nutella","Oreo","Spéculos ","","",""]'), 
('02979ad5-63d8-4df7-8b52-202a5b849ca6', 'Gâteaux au Choix', '', '10.00', 'a1000000-0000-0000-0000-000000000022', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Gateaux%2013Dt.jpeg', true, true, 4, '[]', '[]'), 
('07982470-4b53-4c33-8dc8-4cdfa33a3d59', 'Crêpe Pistachio', null, '14.00', 'a1000000-0000-0000-0000-000000000017', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Crepe%20Pistachio.jpeg', true, false, 2, '[]', '[]'), 
('08b78f23-5af8-44c4-8fa1-1af3fde40469', 'Non Dairy Milk', 'Lait d''Amande / Avoine', '3.00', 'a1000000-0000-0000-0000-000000000012', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Extra%20Lait.jpeg', true, false, 2, '[]', '[]'), 
('0c21f7ae-0573-493b-ac18-9ac96364355e', 'Omelette au Choix', '', '12.00', 'a1000000-0000-0000-0000-000000000016', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Omelette.jpeg', true, false, 2, '[]', '[]'), 
('0da3f611-9bda-4014-aa2d-42c87a1e37c2', 'Crème Chantilly', null, '3.00', 'a1000000-0000-0000-0000-000000000012', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Extra%20Creme%20Chantilly.jpeg', true, false, 3, '[]', '[]'), 
('0df1bb63-c652-4d4c-bf9c-749572e4d9a2', 'Frappuccino Strawberry / Caramel', '', '12.50', 'a1000000-0000-0000-0000-000000000005', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778620053241-h8ekxi.jpeg', true, false, 2, '[{"name":"Strawberry ","price":12.5},{"name":"Caramel","price":12.5}]', '[]'), 
('0e4e16f7-9b0c-48d0-a192-e407184429ab', 'Brownies', '', '15.00', 'a1000000-0000-0000-0000-000000000020', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778619146706-ejy02a.jpeg', true, false, 2, '[]', '[]'), 
('0ef3e6b9-a3c2-446d-887a-f22c1e6037b8', 'Crêpe Tuna', 'Mozza / Sauce Fromagère / Thon / Salade', '13.00', 'a1000000-0000-0000-0000-000000000013', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778594664796-lw869e.jpeg', true, false, 2, '[]', '[]'), 
('0fc90b9c-8c9d-403e-a9de-8260e71652df', 'Croissant Salé Façon Chef', '', '8.00', 'a1000000-0000-0000-0000-000000000016', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778618408306-hfehej.jpeg', true, false, 1, '[]', '[]'), 
('1007b242-2738-41ad-bc31-a7b7d0231580', 'Crêpe Nutella / Mordjene ', '', '13.00', 'a1000000-0000-0000-0000-000000000017', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Nutella.jpeg', true, false, 1, '[]', '[]'), 
('22ecf2bd-3aee-45eb-93d2-929f48870b52', 'French Toast Addict', 'Une boisson chaude / Un jus frais / Eau 1/2L / Pain perdu aux fruits de saison / Pot de yaourt', '15.00', 'a1000000-0000-0000-0000-000000000002', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778594336726-86nd3.jpeg', true, true, 3, '[]', '[]'), 
('23a6240b-29e8-4d2b-b2cc-39446f7a0897', 'Tasty Dreaming', 'Un croissant ou cake / Une boisson chaude / Un jus frais / Eau 1/2L / Omelette du Black Rabbit / Poulet pané', '19.00', 'a1000000-0000-0000-0000-000000000002', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778667007104-x0mvl.jpeg', true, true, 4, '[]', '[]'), 
('275ddec1-053e-4e6d-99c1-f1486e191cc4', 'Gourmet Brunch', 'Deux boissons chaudes, Deux jus frais, Eau 1L, Assortiment de viennoiseries, Deux Pots de Yaourt, Croissant Salé, Toast au thon, Omelette, Poulet Crispy, Brochette, Jambon, Salade, Fruit', '44.00', 'a1000000-0000-0000-0000-000000000002', '', false, false, 0, '[{"name":"Ajout d’un troisième Personne ","price":9}]', '[""]'), 
('27c0e892-cca2-4c29-b918-3bb6ca047bfa', 'Soda', null, '4.50', 'a1000000-0000-0000-0000-000000000011', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/sodaa.jpeg', true, false, 3, '[]', '[]'), 
('333922ac-cde0-4fd1-ac1b-23a75c23c856', 'Nespresso', null, '6.00', 'a1000000-0000-0000-0000-000000000003', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Nespresso%20(2).jpeg', true, false, 10, '[]', '[]'), 
('34a7a360-59dc-465b-b143-1408fc4105e6', 'Black Rabbit Brunch (for two)', 'Deux boissons chaudes / Deux jus frais / Eau 1L / Gaufre / Pancake/Poulet crispy / Omelette / Jambon / Fromage frais/ Salade/ 2 mini Bowls', '37.00', 'a1000000-0000-0000-0000-000000000002', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Brunch.jpeg', true, true, 8, '[]', '[]'), 
('37bb5013-48a6-4a6d-bbb8-511fb21096dd', 'Sandwich Poulet Pané', null, '13.00', 'a1000000-0000-0000-0000-000000000014', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Panini.jpeg', true, false, 3, '[]', '[]'), 
('3b4ea288-71b7-428f-888d-5b88e7f5d9ef', 'Ice Chocolate ', 'Avec arome + 1 DT ', '9.50', 'a1000000-0000-0000-0000-000000000006', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778617240418-wdt67t.jpeg', true, false, 6, '[{"name":"Cookies arome","price":10.5},{"name":"Vanilla arome","price":10.5},{"name":"Caramel arome","price":10.5}]', '[]'), 
('4505a91d-811c-4f10-944b-13911d6c1a68', 'Espresso Macchiato', '', '4.00', 'a1000000-0000-0000-0000-000000000003', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1779461436306-73uk6.jpeg', true, false, 3, '[]', '[]'), 
('465bd175-9fbc-4964-a734-ec80afbab842', 'Ice Matcha Revisité', 'Avec lait d''avoine ', '12.00', 'a1000000-0000-0000-0000-000000000006', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778798927940-hfjthm.jpeg', true, false, 8, '[]', '[]'), 
('47cf889f-09bc-4d62-9066-3f163ba29489', 'Latte', 'Avec Nestlé +1 DT ', '4.50', 'a1000000-0000-0000-0000-000000000003', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1779461502385-mdlo7f.jpeg', true, false, 7, '[]', '[]'), 
('4cf80831-027e-4b00-b326-4099be2887d1', 'Crêpe poulet pané', '', '15.00', 'a1000000-0000-0000-0000-000000000013', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778594653363-icy34d.jpeg', true, true, 0, '[]', '[]'), 
('4e22c988-d0c9-44c6-b42b-f468f7fa440c', 'Petit Déjeuner Express', 'Un croissant ou cake / Une boisson chaude / Un jus frais / Eau 1/2L', '9.00', 'a1000000-0000-0000-0000-000000000002', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778594281583-8lkfw.jpeg', true, false, 1, '[]', '[]'), 
('56462f9a-e6eb-42bc-87cc-64b425533226', 'Black Rabbit Box', '', '17.00', 'a1000000-0000-0000-0000-000000000020', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778176796972-f8i2j9.jpeg', true, true, 3, '[]', '[]'), 
('5d0edda2-6d25-4c04-94ac-ec771ee65b25', 'Crêpe Bombay', 'Mozza / Sauce Fromagère / Viande Hachée / Salade', '15.00', 'a1000000-0000-0000-0000-000000000013', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Crepe%20bombay.jpeg', true, false, 4, '[]', '[]'), 
('5ecc38bf-2519-4900-9e93-d281876d9ff6', 'Classic Mojito', 'Veuillez sélectionner votre parfum préfère ', '10.00', 'a1000000-0000-0000-0000-000000000007', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Classic%20mojito.jpeg', true, true, 2, '[{"name":"Red ","price":11.5},{"name":"Blue ","price":11.5},{"name":"Pinacolada ","price":11.5},{"name":"Mangue ","price":11.5},{"name":"Black Currant","price":13},{"name":"Classic","price":10},{"name":"Rose","price":10}]', '[]'), 
('6733741d-cd54-491a-9b8a-61de14582026', 'Tiramisu Ball 4 Pièces', '', '9.00', 'a1000000-0000-0000-0000-000000000021', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/4%20pieces%20tiramisu%20ball%209dt.jpeg', false, false, 1, '[]', '[]'), 
('682f86f0-f09c-4c64-bd5d-8d938e1ebecd', 'Double Espresso', null, '4.50', 'a1000000-0000-0000-0000-000000000003', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Espresso.jpeg', true, false, 2, '[]', '[]'), 
('68382179-9b97-4a0e-8618-e609e60d3564', 'Jus', '', '10.50', 'a1000000-0000-0000-0000-000000000008', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778667256238-4tc4wo.jpeg', true, false, 3, '[{"name":"Fraise","price":8},{"name":"Kiwi","price":10.5},{"name":"Banane","price":10.5},{"name":"Cocktail de fruits ","price":13}]', '[]'), 
('69acded0-19b0-4b14-ab73-81942fd77bad', 'Boules Nutella / Mordjene', '', '13.00', 'a1000000-0000-0000-0000-000000000018', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Big%20bubbles%20Nutella%20(2).jpeg', true, false, 1, '[]', '[]'), 
('6c6c3b5d-08db-4999-93aa-49bdb8c92660', 'Ice Macchiato', '', '9.50', 'a1000000-0000-0000-0000-000000000006', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1779572116615-eil39r.jpeg', true, true, 5, '[]', '["Chocolate ","Moka ","Hazelnut ","Caramel ","Cookies ","Vanilla"]'), 
('7180d415-6eba-48b4-8351-b67f17c89156', 'Club Sando', 'Un croissant ou cake / Une boisson chaude / Un jus frais / Eau 1/2L / Gaufre façon chef', '22.00', 'a1000000-0000-0000-0000-000000000002', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778594384914-eeok1l.jpeg', true, false, 6, '[]', '[]'), 
('72b24a53-883c-4b90-9ee2-088c95f7ba50', 'Smoothie', 'Fraise / Cassis / Pinacolada / Blue Berry / Mangue / Banane / Black Currant / Passion Fruit', '14.00', 'a1000000-0000-0000-0000-000000000010', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778618202053-q6zh7.jpeg', true, false, 1, '[]', '["Fraise","Cassis ","Pinacolada ","Blue Berry","Mangue ","Banane ","Black Currant","Passion Fruit"]'), 
('737a27c2-e19e-4b5d-9956-420793a226a3', '1/2 Eau', null, '2.00', 'a1000000-0000-0000-0000-000000000011', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/eau.jpeg', true, false, 2, '[]', '[]'), 
('73900d88-0b49-47ab-94c6-6c7a4c99bb92', 'Cheesecake', '', '10.00', 'a1000000-0000-0000-0000-000000000022', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Cheescake.jpeg', true, true, 3, '[]', '[]'), 
('764294b6-2f1e-4e87-a563-a7c6a7d28d95', 'Espresso', null, '3.50', 'a1000000-0000-0000-0000-000000000003', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Espresso.jpeg', true, false, 1, '[]', '[]'), 
('7a29221c-1781-473d-b3c7-06a1396ec22d', 'Boules Bianca', '', '13.00', 'a1000000-0000-0000-0000-000000000018', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Crepe%20biancaa.jpeg', true, false, 4, '[]', '[]'), 
('7b925518-cbde-475e-a499-84866bf81a82', 'Tiramisu classic', '', '10.00', 'a1000000-0000-0000-0000-000000000022', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778619487456-z6typa.jpeg', false, false, 2, '[]', '[]'), 
('7f062708-0ce6-48c4-8fe1-72df7e751b9e', 'Sandwich Tuna', null, '13.00', 'a1000000-0000-0000-0000-000000000014', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Panini.jpeg', true, false, 2, '[]', '[]'), 
('809bb327-6624-47a9-9eb3-a742fa4ac680', 'Boules Black Rabbit', '', '18.00', 'a1000000-0000-0000-0000-000000000018', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778619026506-4di6r6.jpeg', true, false, 3, '[]', '[]'), 
('865cfdc3-7cfa-475c-809f-2cc4352bd7ff', 'Red Bull', null, '11.00', 'a1000000-0000-0000-0000-000000000011', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Red%20Bull.jpeg', true, false, 5, '[]', '[]'), 
('8886dea7-781b-4576-be40-2256d38fa3ec', 'Latte Matcha', 'Avec arome + 3DT ', '9.50', 'a1000000-0000-0000-0000-000000000003', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778798010788-f6csi.jpeg', true, false, 13, '[{"name":"Classic ","price":9.5},{"name":"Avec Arome","price":12.5}]', '[]'), 
('8a01458c-3a6f-465b-9023-705802109c01', 'Crêpe Tunisienne', 'Mozza / Sauce Fromagère / Thon / Oeuf / Jambon / Salade', '15.00', 'a1000000-0000-0000-0000-000000000013', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Crepe%20Tunisienne.jpeg', true, false, 5, '[]', '[]'), 
('8c835dd5-2c7f-417e-addf-ae02185d6b1a', 'Tacos Poulet Pané', null, '13.00', 'a1000000-0000-0000-0000-000000000015', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Tacos%20Poulet%20Pann%C3%A9e.jpeg', true, false, 1, '[]', '[]'), 
('990c0967-d696-4afe-84ff-0572e6729597', 'Cappuccino+', '', '9.50', 'a1000000-0000-0000-0000-000000000003', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Cappuccino.jpeg', true, false, 5, '[]', '[]'), 
('9ba9bdb5-5d06-4d40-81a3-78373e6eefb4', 'Fondant Nutella', '', '10.00', 'a1000000-0000-0000-0000-000000000022', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778619424371-jtte1bu.jpeg', true, false, 1, '[]', '[]'), 
('9d46254e-5841-475e-9624-627a2d076781', 'Milkshake Black Rabbit', '', '14.00', 'a1000000-0000-0000-0000-000000000009', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778617790778-ewafam.jpeg', true, true, 3, '[]', '[]'), 
('9f79eaae-bca7-4590-9267-92f626a74163', 'Hot Chocolate', '', '10.50', 'a1000000-0000-0000-0000-000000000003', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Hot%20choco.jpeg', true, false, 8, '[]', '[]'), 
('a0f7fd1f-7cd6-4bc6-b252-750989ef294e', 'Ice Americano', '', '6.00', 'a1000000-0000-0000-0000-000000000006', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Ice_am%C3%A9ricano-removebg-preview.png', true, false, 1, '[]', '[]'), 
('a553465f-6b6d-43ed-9249-c35d170481ff', 'Special Macchiato', '', '11.50', 'a1000000-0000-0000-0000-000000000003', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778594480057-4fe6pm.jpeg', true, true, 12, '[]', '["Nutella ","Speculos ","Pistachio "]'), 
('a7680a4e-607c-4508-9e5a-42c379c77b1f', 'Frappuccino Chocolate / Moka / Hazelnut', '', '11.50', 'a1000000-0000-0000-0000-000000000005', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Frappuccino.jpeg', true, false, 1, '[{"name":"Chocolate ","price":11.5},{"name":"Moka ","price":11.5},{"name":"Hazelnut","price":11.5}]', '[]'), 
('a9799f7a-de16-4ce7-9a53-5d55d7510b03', 'Extra Fruit Sec / Oreo / Snickers / Lotus / Ferrero / Bueno', null, '3.00', null, 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Extra%20Oreo.jpeg', true, false, 1, '[]', '[]'), 
('abd0cdff-f2f5-45bf-bad0-bea72132d34a', 'Fraisier', '', '11.00', 'a1000000-0000-0000-0000-000000000022', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778619571709-it03zn.jpeg', true, true, 0, '[]', '[]'), 
('b211a93c-4315-4f7e-b858-e2f45a90f9be', 'Crêpe Orientale', 'Mozza / Sauce Fromagère / Jambon / Salade', '13.00', 'a1000000-0000-0000-0000-000000000013', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Cr%C3%AApe%20orientale.jpeg', true, false, 3, '[]', '[]'), 
('b48a1c9f-d49a-4a04-87a2-50eb0980bfb1', 'Wake Up', 'Un croissant ou cake / Une boisson chaude / Un jus frais / Eau 1/2L / Oeufs brouillés / Jambon / Gruyère', '19.00', 'a1000000-0000-0000-0000-000000000002', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Wake%20up.jpeg', true, true, 5, '[]', '[]'), 
('b6d4fbb5-098c-47db-b703-f4ea2ad8f4cf', 'Croissant Addict', 'Une boisson chaude / Un jus frais / Eau 1/2L / Croissant salés façon Black Rabbit / Salade', '15.00', 'a1000000-0000-0000-0000-000000000002', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778616860112-q2pl5f.jpeg', true, false, 7, '[]', '[]'), 
('b880f815-8ac1-4296-bd32-ca71026a0eba', 'Sirop', 'Caramel / Hazelnut / Chocolat / Strawberry', '1.00', 'a1000000-0000-0000-0000-000000000012', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Extra%20Sirop.jpeg', true, false, 1, '[]', '[]'), 
('bd49bba6-cfbd-4eef-9213-6f2708b6899d', 'Milkshake Pistachio', null, '13.00', 'a1000000-0000-0000-0000-000000000009', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Milkshake%20pistache.jpeg', true, false, 2, '[]', '[]'), 
('bf4d808c-6e90-4d02-8280-1f726ea98a15', 'Boules Pistachio', null, '16.00', 'a1000000-0000-0000-0000-000000000018', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Big%20Bubbles%20Pistachio.jpeg', true, false, 2, '[]', '[]'), 
('bff3075a-18fc-465f-8e18-7e43d6fad1e9', 'Pancake Addict', 'Une boisson chaude / Un jus frais / Eau 1/2L / Pancake / Pot de yaourt', '15.00', 'a1000000-0000-0000-0000-000000000002', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778177326143-2298d3.jpeg', true, false, 2, '[]', '[]'), 
('c240a46b-5ea5-4286-810b-3af85968309d', 'Club Sandwich ', '', '12.00', 'a1000000-0000-0000-0000-000000000016', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778618297170-wz085p.jpeg', true, true, 0, '[]', '[]'), 
('c6514449-a8b1-4909-bb6d-0bc5eb386b44', 'Americano', '', '4.00', 'a1000000-0000-0000-0000-000000000003', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778953415951-d4q4oi.jpeg', true, false, 4, '[]', '[]'), 
('c98c10e2-4cc8-4273-992a-06c268448200', 'Ice Spanish Latte aromatisé', '', '10.00', 'a1000000-0000-0000-0000-000000000006', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Ice%20spanish%20latte.jpeg', true, false, 3, '[]', '[]'), 
('ca3f8dc7-9e57-4d19-b271-62718e532e08', 'Classic Macchiato', 'Veuillez sélectionner votre parfum préférée ', '8.00', 'a1000000-0000-0000-0000-000000000003', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1779571502221-f1hnqy.jpeg', true, false, 11, '[]', '["Chocolate ","Hazelnut ","Caramel","Vanilla"]'), 
('cc56f57f-f1bc-4ebe-97e2-7ef4bc360554', 'Dutch Pancake', null, '15.00', 'a1000000-0000-0000-0000-000000000020', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/DUTCH.jpeg', true, false, 1, '[]', '[]'), 
('d39008a3-e0f8-4da8-99f1-8646c87d5648', 'PowerLeaf ', 'Latte Matcha, Jus, Eau 1/2L, Yaourt Graniola, Toast Signature Black Rabbit, Salade, Fruits ', '24.00', 'a1000000-0000-0000-0000-000000000002', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778797849934-08neaq.jpeg', true, true, 0, '[]', '[]'), 
('d60733fe-2ecb-4cdd-9b4b-6fbd8fc3a0aa', 'Energetic Mojito ', 'Red Bull ou Shark ', '12.50', 'a1000000-0000-0000-0000-000000000007', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Mojito%20(2).jpeg', true, false, 1, '[{"name":"Red Bull ","price":12.5},{"name":"Shark","price":12.5}]', '[]'), 
('d6c1bfb5-c293-4db4-8cac-b5247b441736', 'Crêpe Bianca', null, '10.00', 'a1000000-0000-0000-0000-000000000017', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Crepe%20biancaa.jpeg', true, false, 4, '[]', '[]'), 
('d99962fb-4ffc-453d-858b-73f80d4b600e', 'Frappuccino Speculos / Nutella / Snikers', '', '13.50', 'a1000000-0000-0000-0000-000000000005', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778594544212-vxruh.jpeg', true, false, 3, '[{"name":"Speculos ","price":13.5},{"name":"Nutella ","price":13.5},{"name":"Snikers","price":13.5},{"name":"Pistache","price":13.5}]', '[]'), 
('df92a75b-334f-401d-8dc2-23cc93251a11', 'Tiramisu Pistache ', '', '11.00', 'a1000000-0000-0000-0000-000000000022', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778619641787-bi05mo.jpeg', true, true, 0, '[]', '[]'), 
('e28e7ec8-ed92-4625-8fa4-d213d1767227', 'Kyufi Tea', null, '5.00', 'a1000000-0000-0000-0000-000000000003', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Kyufi%205dt.jpeg', true, false, 9, '[]', '[]'), 
('e6834d5c-e345-48cc-bfbc-08c08ae8a200', 'Crêpe Black Rabbit', '', '16.00', 'a1000000-0000-0000-0000-000000000017', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778619062043-lfno5.jpeg', true, false, 3, '[]', '[]'), 
('e9c43987-bb51-4948-b25d-a8c813295fd2', 'TiraBox', '', '9.50', 'a1000000-0000-0000-0000-000000000022', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1779211919042-vyvcna.jpeg', true, true, 0, '[]', '[]'), 
('f076bc51-7b66-429f-9ab3-d73e2a82b75c', 'Tiramisu Ball 6 Pièces', '', '13.00', 'a1000000-0000-0000-0000-000000000021', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/7%20Pieces%20tiramisu.jpeg', false, false, 2, '[]', '[]'), 
('f2c3c313-527d-42b7-a8f6-e44b08c34b09', 'Crêpe Cheesy', 'Harissa au choix / Mozza / Gruyère / Sauce Fromagère / Fromage Blanc / Salade', '13.00', 'a1000000-0000-0000-0000-000000000013', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Crepe%20Tuna.jpeg', true, false, 1, '[]', '[]'), 
('f4955ba1-d36d-4ad3-a1ab-7388022185df', 'Affogato', '', '9.00', 'a1000000-0000-0000-0000-000000000006', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778617698693-iogeym.jpeg', true, false, 4, '[]', '[]'), 
('f66660dc-5f7b-4fe6-8f17-24dda4b43bfb', 'Tagliatelle', 'Nutella / Fruit de Saison / Fruit Sec / Mascarpone', '18.00', 'a1000000-0000-0000-0000-000000000019', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/Crepe%20tagliatelli.jpeg', true, false, 1, '[]', '[]'), 
('f711bbc7-92f1-400b-8f59-d32ea7bd0e17', 'Citronade', '', '8.00', 'a1000000-0000-0000-0000-000000000008', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/citronade.jpeg', true, false, 2, '[{"name":"Citronade","price":8},{"name":"Citronade glacé","price":10}]', '[]'), 
('f822ce65-211b-4ed4-a60a-ed1d3c163744', 'Capucin', '', '4.00', 'a1000000-0000-0000-0000-000000000003', 'https://qwbkfhfljdhxzrlaommq.supabase.co/storage/v1/object/public/menu-images/1778797879864-ourl39.jpeg', true, false, 0, '[]', '[]'), 
('fa0bcda1-0950-4d43-aa04-b4543b1ce5ab', 'V60 Coffee', '', '9.00', 'a1000000-0000-0000-0000-000000000003', 'https://raw.githubusercontent.com/Azizmrika/Black-Rabbit-menu/main/V60.jpeg', true, false, 14, '[]', '[]');

-- App Settings
INSERT INTO "public"."app_settings" ("id", "key", "value", "updated_at") VALUES 
('3182ba9a-0b27-486b-bb23-2fc2e1904601', 'floor_plan_layout', '{"doors":[],"walls":[],"zones":[{"h":0,"w":0,"x":0,"y":0,"id":"zone-1773189274873","color":"220 70% 50%","label":"Salle","points":[{"x":58,"y":32},{"x":58,"y":40},{"x":34,"y":40},{"x":34,"y":64},{"x":46,"y":64},{"x":76,"y":64},{"x":76,"y":18},{"x":58,"y":18}]},{"h":14,"w":56,"x":22,"y":66,"id":"zone-1773190490290","color":"35 80% 50%","label":"Terrasse"},{"h":24,"w":12,"x":22,"y":40,"id":"zone-1773190507816","color":"142 70% 45%","label":"Comptoir"},{"h":6,"w":6,"x":70,"y":12,"id":"zone-1773247789054","color":"210 80% 60%","label":"WC"},{"h":6,"w":6,"x":58,"y":12,"id":"zone-1773247821545","color":"210 80% 60%","label":"WC"}]}', '2026-03-23 22:56:00.83439+00'), 
('72143c2c-8c17-4858-920d-02ec68847c87', 'delivery_fee', '3', '2026-05-05 18:52:01.293696+00'), 
('77d65cbe-ade4-49a2-9072-3cee4f645e08', 'hidden_categories', '["Coffee"]', '2026-03-23 22:56:00.83439+00'), 
('c9f10229-ff13-4114-b7c3-e0b373ad1e91', 'ramadan_mode', 'false', '2026-03-23 22:56:00.83439+00'), 
('ea66f8d5-7686-4c43-b9f8-61f3d992a030', 'working_hours', '{"0":{"open":"08:00","close":"00:00","is_closed":false},"1":{"open":"08:00","close":"23:00","is_closed":false},"2":{"open":"08:00","close":"23:00","is_closed":false},"3":{"open":"08:00","close":"23:00","is_closed":false},"4":{"open":"08:00","close":"23:00","is_closed":false},"5":{"open":"08:00","close":"23:00","is_closed":false},"6":{"open":"08:00","close":"00:00","is_closed":false}}', '2026-04-14 13:24:44.572476+00'), 
('edc47ae8-46cb-49b4-b3b3-f3c7c88beef4', 'delivery_enabled', 'true', '2026-03-23 22:56:00.83439+00');

-- Tables
INSERT INTO "public"."tables" ("id", "number", "qr_token", "is_active", "created_at", "min_seats", "max_seats", "x_position", "y_position", "zone", "width", "height") VALUES 
('01a5ccf1-a130-401f-8320-0e66ad10f116', 13, '4ed3ff333c6744167961c017f29dd8f6675cd9f0116c5ec44f7eb6faf5395402', true, '2026-03-28 00:25:21.170601+00', 1, 4, 66, 52, null, null, null), 
('1559c241-2b34-400f-8434-71f5fbf247b9', 5, '153b0e12fefb791e87ed259f2491bd897a0c7f1077bdf2513166ef97eaeb5723', true, '2026-03-28 00:25:08.081231+00', 1, 4, 60, 30, null, 4, 22), 
('22ca0845-a494-4696-9af7-3d4ef9e0b2e5', 21, 'ab397ce6aeef0c3a8aeef08e0b316125be2202609dd1ff9730043aecacdf702d', true, '2026-03-28 00:25:25.962855+00', 1, 4, 64, 70, null, null, null), 
('27f83946-25f9-407f-85cb-889a0463b857', 16, '7ee9bb7d7bdff5b17b1f22f628016cdfc94cbfeb28be9c035d705473262c0566', true, '2026-03-28 00:25:23.218755+00', 1, 4, 44, 76, null, null, null), 
('2893aa0d-d1ca-4019-a575-327a5c1e890f', 19, 'e8e141cd965e7db0cfd5dd8dd287ab47cc9a7a1bd3b32a6f83c287ae05c6bd9d', true, '2026-03-28 00:25:24.963549+00', 1, 4, 72, 76, null, null, null), 
('2946b74a-117f-4548-ac5d-4378fa4d353a', 7, 'f56b03cbc68bbb88643bae02ca7883551d193726ee2c277587736cfcf60a70f5', true, '2026-03-28 00:25:09.675865+00', 1, 4, 72, 34, null, null, null), 
('2e6d6c3a-c60a-49ed-814f-3cdb47395052', 1, '5dea3489bf0601e3fcdbf3d01188772da732d578ad54f8dfd5cf1ea941a29401', true, '2026-03-28 00:24:48.803576+00', 1, 4, 38, 44, null, 5, 5), 
('30e08f0e-9976-4eaf-87ba-7285c1c1760f', 12, '9fb57307373e8f09fa5b298f62d3d560279ea570cb4b348c01a6474dc34bae2f', true, '2026-03-28 00:25:20.392997+00', 1, 4, 48, 60, null, null, null), 
('45e60a1e-046b-4795-acc0-45d5ff4a8db1', 2, 'a4d534f7bb872a303bcfeb21f5c4814c2e69095a28c051002d2f8b17afed3358', true, '2026-03-28 00:24:50.670756+00', 1, 4, 44, 44, null, 5, 5), 
('4c2425e9-ef92-4e84-b612-2ed121e89e3f', 6, '671452aa492d19edcb9d16a497af43804aac1cc556460bffeb6cf0101dfd45ab', true, '2026-03-28 00:25:08.936603+00', 1, 4, 72, 22, null, null, null), 
('51bb01c3-a345-46fb-92a1-80e322458a11', 24, 'e78a8b0b2b3a05a439a1f5e0a7943b546371d42b2807b409fbf1e764a4be1760', true, '2026-03-28 00:25:27.578603+00', 1, 4, 32, 70, null, null, null), 
('54c2ea8f-90e9-4231-b925-7696eb96f5ea', 10, '586a8faea04b3b8c37b71442c05f6e9a5f453fab8fd9e233f2d7e7e0f985f5b5', true, '2026-03-28 00:25:18.448725+00', 1, 4, 64, 60, null, null, null), 
('55a7b31f-b955-4c40-8da1-9ea50da003d8', 8, '71cfea2002abc301952dd5da35b7a18771d8f409fae65baf0c23897eb6e1eaf1', true, '2026-03-28 00:25:13.271794+00', 1, 4, 72, 42, null, null, null), 
('5fd3d414-3659-4684-af2a-862697fb867c', 4, '25f4d78313dbd2a03242ecd56056d2e7896b9f1848821b680003682de3e6f593', true, '2026-03-28 00:25:07.089028+00', 1, 4, 58, 44, null, 5, 5), 
('6bbb0275-e2dd-4ce5-a0d5-854b1013fc28', 18, 'd5b4e61b782a4aa5f5a62fb4d54df0f30502367f234bc0307abc3908f0334723', true, '2026-03-28 00:25:24.40025+00', 1, 4, 64, 76, null, null, null), 
('7e3fbdac-837d-42b7-9548-6fec01a4d76f', 25, '3b025e442433a5d99c12403cb5de92ef4a399fde5f601056f8def688637f48df', true, '2026-03-28 00:25:27.950525+00', 1, 4, 32, 76, null, 6, 6), 
('7f7e9729-fe97-4563-80e3-8bbd6bdee6e0', 9, 'b132af3d9765bdf717adb180ca0179860969e4acc54062f215738c07c376cca7', true, '2026-03-28 00:25:17.072467+00', 1, 4, 72, 60, null, 6, 6), 
('8253ab53-adb7-47a2-8179-c15ee7211fe9', 23, '8fcc263297e9ed4c20266b9d30a39f88b788c181092243b3623df80fc217f006', true, '2026-03-28 00:25:26.955996+00', 1, 4, 44, 70, null, null, null), 
('9d60a14c-b0ac-4d95-bc6e-ec5bd9de263e', 22, '4c51de52c7e490ceced586ff6b5ba3e5a6fdb68ee7d77779e331bfe49c8e77d4', true, '2026-03-28 00:25:26.472769+00', 1, 4, 54, 70, null, null, null), 
('bb31154f-c1fe-436a-8fee-f197dd913993', 17, '2307a2eb5121a36c0cbf3e2820fad3d1d36eb24532caa244a251d8b36b14f05b', true, '2026-03-28 00:25:23.885142+00', 1, 4, 54, 76, null, null, null), 
('c625fc0b-776a-4386-849d-9fdd2cf9518b', 15, 'f594fa3498858e8bd393bc4508985d431b0ea0326c895c19188358b0847f4efd', true, '2026-03-28 00:25:22.58318+00', 1, 4, 26, 72, null, 6, 14), 
('d71d00df-f7fe-49af-b64c-7d78e4f3d79b', 20, '8f5e95d473f9276ca9c0e75cf0a89a934bb4a9c54471d43e8254a46e26c632d1', true, '2026-03-28 00:25:25.474279+00', 1, 4, 72, 70, null, null, null), 
('e346e631-54de-44ee-8fdc-b7d9d44986a5', 3, '9034ab06e0968d7bb93d6737e69b83c43701ba389de449c66a012576e9c689c2', true, '2026-03-28 00:24:51.839297+00', 1, 4, 52, 44, null, 5, 5), 
('e3f28137-4ddf-4338-9a87-329583d47b6a', 14, 'c226b3155636db719f14131ad17e6def77d3f2880af8d6135854912788c5d4b9', true, '2026-03-28 00:25:21.904629+00', 1, 4, 66, 46, null, 6, 6), 
('e6473976-d2ff-42d8-8bc8-4c3ef8fd9d53', 11, '2c6946b57379490a59c5d7b2199314e9bcb099914028c78d7c34288442d1f474', true, '2026-03-28 00:25:19.454241+00', 1, 4, 56, 60, null, null, null);

-- Menu Item Extras
INSERT INTO "public"."menu_item_extras" ("id", "name", "price", "category_id", "created_at") VALUES 
('0d2c06dc-4107-4d27-8da1-d695c7d8d104', 'Nestlé', '1.00', 'a1000000-0000-0000-0000-000000000003', '2026-03-31 18:28:26.058917+00'), 
('44f27bae-107d-46a5-8329-1fec473ca3fd', 'Lait d''avoine ', '3.00', 'a1000000-0000-0000-0000-000000000006', '2026-03-31 18:27:42.431073+00'), 
('61b0e387-aaca-4001-b104-f61a6fc89434', 'Arome', '1.00', 'a1000000-0000-0000-0000-000000000006', '2026-03-31 18:27:54.894902+00'), 
('bfe83056-f7a6-49db-966c-aad003bea8bc', 'Double Chocolat', '3.00', 'a1000000-0000-0000-0000-000000000010', '2026-03-31 17:07:40.351196+00'), 
('d25bdcad-c5a6-48ab-bfbc-d83b5f3e2ca6', 'Arome', '1.00', 'a1000000-0000-0000-0000-000000000003', '2026-03-31 18:28:14.179311+00'), 
('d2e7b88c-cd31-4232-acf8-928d76cfd6a7', 'Crème chantilly', '3.00', 'a1000000-0000-0000-0000-000000000010', '2026-03-31 17:02:15.113794+00');

-- Orders
INSERT INTO "public"."orders" ("id", "table_id", "table_number", "status", "total", "notes", "created_at", "updated_at", "tracking_code") VALUES 
('00529b36-1e02-4379-97c0-1760ce36cd1f', '2946b74a-117f-4548-ac5d-4378fa4d353a', 7, 'completed', '25.50', '', '2026-05-29 19:33:22.186127+00', '2026-05-29 20:45:34.44159+00', 'BR-6BNOJ'), 
('0318aa9b-de58-46b6-9960-154f3c653c7d', 'e6473976-d2ff-42d8-8bc8-4c3ef8fd9d53', 11, 'completed', '18.00', '', '2026-05-10 08:30:22.885707+00', '2026-05-14 17:18:34.271572+00', 'BR-K5ZV9'), 
('0d13f3a2-f746-46aa-8789-791b0903c873', 'd71d00df-f7fe-49af-b64c-7d78e4f3d79b', 20, 'completed', '37.00', '', '2026-05-19 08:17:06.605876+00', '2026-05-20 17:15:20.873053+00', 'BR-D5NP2'), 
('11333ce2-c936-4b45-8426-0cc479899d00', '6bbb0275-e2dd-4ce5-a0d5-854b1013fc28', 18, 'completed', '24.00', 'Tacos sans lettuce sans tomates ', '2026-05-29 18:41:46.038379+00', '2026-05-29 20:45:38.153403+00', 'BR-5RSN4'), 
('158947f4-08e1-4163-922c-03f8a3605380', '9d60a14c-b0ac-4d95-bc6e-ec5bd9de263e', 22, 'pending', '37.00', '1 omlette sans fromage. ', '2026-06-05 09:47:40.069579+00', '2026-06-05 09:47:40.069579+00', 'BR-VTA8B'), 
('1a194c24-8de5-47b6-8e6e-8a2856f1dc16', 'e346e631-54de-44ee-8fdc-b7d9d44986a5', 3, 'completed', '16.00', '', '2026-05-31 12:04:46.492823+00', '2026-05-31 13:53:11.072875+00', 'BR-HOSH0'), 
('1ad326cc-e60e-4702-bc50-081b7740500c', '2e6d6c3a-c60a-49ed-814f-3cdb47395052', 1, 'completed', '15.00', '', '2026-04-24 10:45:23.937292+00', '2026-04-24 10:46:28.076166+00', 'BR-7EWFH'), 
('1d953413-8dd4-4977-87f1-23ec864b32b5', '51bb01c3-a345-46fb-92a1-80e322458a11', 24, 'completed', '18.50', '', '2026-05-28 16:48:09.512717+00', '2026-05-28 18:17:02.809892+00', 'BR-2F653'), 
('1e539d10-e077-4acc-a2a6-ec55bf4838c8', '2e6d6c3a-c60a-49ed-814f-3cdb47395052', 1, 'completed', '15.00', '', '2026-04-24 10:47:27.710996+00', '2026-04-24 10:54:07.368474+00', 'BR-USD1W'), 
('1e6fb274-344e-41fe-a47e-e4c7b342cbfc', 'e6473976-d2ff-42d8-8bc8-4c3ef8fd9d53', 11, 'completed', '37.00', '', '2026-05-24 09:42:53.183083+00', '2026-05-28 20:35:15.260515+00', 'BR-LYZGD'), 
('29822515-4286-46f5-93db-bd6026441600', '2893aa0d-d1ca-4019-a575-327a5c1e890f', 19, 'completed', '37.00', '', '2026-05-17 09:36:43.072385+00', '2026-05-17 17:27:16.471211+00', 'BR-3T7X1'), 
('2b34d9ef-088c-48ea-bd62-6692840ee353', 'd71d00df-f7fe-49af-b64c-7d78e4f3d79b', 20, 'completed', '8.00', 'Bien serrée svp', '2026-05-20 19:48:44.072016+00', '2026-05-21 19:03:33.737361+00', 'BR-H0BE8'), 
('2e1a7f95-5272-4a32-a5a2-f37b2cc0178a', '2946b74a-117f-4548-ac5d-4378fa4d353a', 7, 'completed', '22.50', '', '2026-05-21 17:01:08.651131+00', '2026-05-21 19:03:27.904419+00', 'BR-IMMVJ'), 
('30602cff-5eab-4aa1-b246-cfacb7b2a3a9', '51bb01c3-a345-46fb-92a1-80e322458a11', 24, 'completed', '41.00', 'Brabi 7otli hrissa fl crêpe merci', '2026-05-28 18:42:56.835491+00', '2026-05-28 20:35:06.176152+00', 'BR-V85NS'), 
('4399cb34-ff63-4d34-be0b-5a20e2737e24', '9d60a14c-b0ac-4d95-bc6e-ec5bd9de263e', 22, 'completed', '10.00', '', '2026-05-30 13:03:44.113487+00', '2026-05-31 13:53:17.473933+00', 'BR-OEKNT'), 
('5a53c8e6-2b0f-426c-b436-0e2ea5a6a573', '45e60a1e-046b-4795-acc0-45d5ff4a8db1', 2, 'completed', '9.00', 'Nefs el 3abd lii jee lbaree7 ma 9etech kifech notleb el addition mel application \n2: Hetha esmi ken test7a9 ay 7aja coté informatique ''Saif Maaref'' w hethy societe ta3ii ''https://smconsult.tn''', '2026-05-06 21:38:10.84616+00', '2026-05-14 17:18:42.330055+00', 'BR-ENJK4'), 
('5b468952-3704-43f6-91a3-645b9279c14c', '2946b74a-117f-4548-ac5d-4378fa4d353a', 7, 'completed', '19.00', '', '2026-05-20 09:49:29.113057+00', '2026-05-20 17:15:14.427368+00', 'BR-4EY99'), 
('6786372c-146c-45ef-9a3b-fbe9ddfef372', '9d60a14c-b0ac-4d95-bc6e-ec5bd9de263e', 22, 'completed', '19.00', '', '2026-05-30 10:30:03.43513+00', '2026-05-31 13:53:20.294645+00', 'BR-NU201'), 
('6d317803-996c-46c6-8e09-47fe499ae9f0', '9d60a14c-b0ac-4d95-bc6e-ec5bd9de263e', 22, 'pending', '10.00', '', '2026-06-05 18:19:59.283738+00', '2026-06-05 18:19:59.283738+00', 'BR-EWABH'), 
('74b006a8-a529-4f51-962a-243862acba8c', '7f7e9729-fe97-4563-80e3-8bbd6bdee6e0', 9, 'completed', '25.50', 'يرجى عدم إحضار المكسرات أو الفاكهة.', '2026-05-13 20:09:30.607626+00', '2026-05-14 17:18:29.291946+00', 'BR-83DK9'), 
('75ee3043-fbc1-44e1-acbc-e1b5a0ba8e08', 'e346e631-54de-44ee-8fdc-b7d9d44986a5', 3, 'completed', '37.00', '', '2026-05-10 08:36:01.410814+00', '2026-05-14 17:18:32.101177+00', 'BR-E0ZXG'), 
('7a5a3d30-8d2d-46e8-89c5-85dbeb2455b1', '01a5ccf1-a130-401f-8320-0e66ad10f116', 13, 'completed', '37.00', '', '2026-05-17 09:52:53.961278+00', '2026-05-17 17:27:13.774697+00', 'BR-SQPPK'), 
('814e8615-1672-4482-a991-499d285902c9', '51bb01c3-a345-46fb-92a1-80e322458a11', 24, 'completed', '41.50', '', '2026-05-17 17:25:46.11377+00', '2026-05-20 17:15:25.838645+00', 'BR-ZPB83'), 
('880782f0-860d-4845-bb48-e3bab71ab46b', '2e6d6c3a-c60a-49ed-814f-3cdb47395052', 1, 'completed', '33.00', '', '2026-05-22 18:17:18.012556+00', '2026-05-23 18:15:11.632917+00', 'BR-VQXJV'), 
('88ded1e8-d4b3-4866-80f6-2a7966fe7d3d', '45e60a1e-046b-4795-acc0-45d5ff4a8db1', 2, 'completed', '10.00', '', '2026-05-30 22:20:51.364571+00', '2026-05-31 13:53:03.714451+00', 'BR-XJLXP'), 
('90993369-e47d-4c64-9a7d-9e2fddacf2cd', '9d60a14c-b0ac-4d95-bc6e-ec5bd9de263e', 22, 'completed', '37.00', '', '2026-05-23 09:58:14.685585+00', '2026-05-23 18:15:05.569017+00', 'BR-8ZN0T'), 
('93759a11-6fee-4087-88eb-ff6721a0fe92', 'e346e631-54de-44ee-8fdc-b7d9d44986a5', 3, 'completed', '7.50', '', '2026-05-24 18:03:46.152869+00', '2026-05-28 20:35:13.752362+00', 'BR-HFFOI'), 
('9a1bffa5-095e-44dc-8b24-b33ec58cb10c', '22ca0845-a494-4696-9af7-3d4ef9e0b2e5', 21, 'completed', '28.00', '', '2026-05-25 21:02:47.602914+00', '2026-05-28 20:35:10.899011+00', 'BR-H6H2N'), 
('9a4c87d2-2faf-4e59-be21-c32c93f15ff1', '9d60a14c-b0ac-4d95-bc6e-ec5bd9de263e', 22, 'completed', '21.50', '', '2026-05-30 13:04:08.602628+00', '2026-05-31 13:53:14.904073+00', 'BR-KQ7T5'), 
('9db92e86-48b1-4332-bdbe-40948fb1794c', '22ca0845-a494-4696-9af7-3d4ef9e0b2e5', 21, 'completed', '25.00', '', '2026-05-21 20:07:08.761306+00', '2026-05-23 18:15:22.191407+00', 'BR-JKFPC'), 
('9f124bf0-b069-4c44-af9e-fbc6a87038a5', '01a5ccf1-a130-401f-8320-0e66ad10f116', 13, 'completed', '32.00', '', '2026-05-08 16:47:35.701017+00', '2026-05-14 17:18:40.654745+00', 'BR-FQR4S'), 
('9f93ee04-9afa-418a-b0d9-46c6dee52abd', 'd71d00df-f7fe-49af-b64c-7d78e4f3d79b', 20, 'completed', '8.50', '', '2026-05-27 18:20:08.096711+00', '2026-05-28 20:35:08.026645+00', 'BR-0OBPI'), 
('b10b96ab-caa1-4836-bf45-baea5ef6abbc', '54c2ea8f-90e9-4231-b925-7696eb96f5ea', 10, 'completed', '12.00', '', '2026-05-05 18:25:19.2431+00', '2026-05-05 18:25:57.181838+00', 'BR-T7BOU'), 
('b3f51c3b-2f26-4f52-ba94-14cbc9c376ec', '6bbb0275-e2dd-4ce5-a0d5-854b1013fc28', 18, 'completed', '42.00', '', '2026-05-29 10:23:38.568725+00', '2026-05-29 20:45:41.494197+00', 'BR-YZQUX'), 
('b9014dcf-590a-49ac-8b25-c47fdf6ca68f', '22ca0845-a494-4696-9af7-3d4ef9e0b2e5', 21, 'completed', '41.00', '', '2026-05-14 17:28:46.678261+00', '2026-05-14 22:28:52.322213+00', 'BR-736Y2'), 
('b9974291-b908-46bc-b28d-9e30c44eeb03', '2946b74a-117f-4548-ac5d-4378fa4d353a', 7, 'completed', '37.00', '', '2026-05-21 09:43:03.206741+00', '2026-05-21 19:03:29.283018+00', 'BR-HYOWS'), 
('bee5732b-ccba-4714-afcf-7d20bc8902aa', '22ca0845-a494-4696-9af7-3d4ef9e0b2e5', 21, 'completed', '4.50', '', '2026-05-25 21:04:10.73283+00', '2026-05-28 20:35:09.493153+00', 'BR-WW1YZ'), 
('c27dd1d0-aadb-4f40-97dd-c66e9ef3baeb', '2e6d6c3a-c60a-49ed-814f-3cdb47395052', 1, 'completed', '10.00', '', '2026-05-19 19:41:50.680764+00', '2026-05-20 17:15:17.989281+00', 'BR-VZIKF'), 
('c49f1f36-89e1-4cb4-bce0-bff2729b0bd8', 'd71d00df-f7fe-49af-b64c-7d78e4f3d79b', 20, 'completed', '31.00', '', '2026-05-24 15:30:39.0523+00', '2026-05-24 17:56:55.634911+00', 'BR-V4A10'), 
('c51fef66-ba0e-4bbb-ad66-d05986aa9ab7', '45e60a1e-046b-4795-acc0-45d5ff4a8db1', 2, 'completed', '9.50', '', '2026-05-30 21:39:30.683417+00', '2026-05-31 13:53:06.256117+00', 'BR-EG43V'), 
('cc1e6a91-0cd5-499a-aeaa-981576d8be9b', '9d60a14c-b0ac-4d95-bc6e-ec5bd9de263e', 22, 'completed', '48.00', '', '2026-05-28 17:36:08.253802+00', '2026-05-28 18:18:06.919344+00', 'BR-VQFO8'), 
('d04dc4ce-3cf0-4785-bfd5-07b76fe4aca2', '55a7b31f-b955-4c40-8da1-9ea50da003d8', 8, 'completed', '19.00', '', '2026-05-17 19:52:36.603149+00', '2026-05-20 17:15:23.848535+00', 'BR-6YSK3'), 
('d17cf1cb-8cd2-41ea-9e18-b8fb3d067cd2', '55a7b31f-b955-4c40-8da1-9ea50da003d8', 8, 'completed', '35.00', '', '2026-05-09 12:02:51.333765+00', '2026-05-14 17:18:38.74786+00', 'BR-ZL7XK'), 
('d9f0e084-e191-4c60-8700-46af74a7d9af', 'e346e631-54de-44ee-8fdc-b7d9d44986a5', 3, 'completed', '31.00', '', '2026-05-09 15:52:45.504174+00', '2026-05-14 17:18:36.269747+00', 'BR-6K2YL'), 
('ebc16914-2cb1-4231-893e-4ff89342b7a6', '45e60a1e-046b-4795-acc0-45d5ff4a8db1', 2, 'completed', '5.50', '', '2026-05-16 20:18:10.27327+00', '2026-05-17 17:27:19.45007+00', 'BR-ONU2B'), 
('f0501aa7-daae-419e-9bc1-d20253bac34d', '6bbb0275-e2dd-4ce5-a0d5-854b1013fc28', 18, 'completed', '11.00', '', '2026-06-03 18:34:14.027633+00', '2026-06-03 18:52:57.332499+00', 'BR-XNCLG'), 
('f27f4147-e1ec-4f05-a21c-9d2590af4807', '01a5ccf1-a130-401f-8320-0e66ad10f116', 13, 'completed', '12.50', '', '2026-05-30 16:49:30.728966+00', '2026-05-31 13:53:12.493464+00', 'BR-HPM0O'), 
('f361730b-1ec1-47c9-a1d6-b49b754e4f5c', 'e346e631-54de-44ee-8fdc-b7d9d44986a5', 3, 'completed', '15.50', '', '2026-05-28 19:07:16.494375+00', '2026-05-28 20:35:01.481533+00', 'BR-9A496');

-- Order Items
INSERT INTO "public"."order_items" ("id", "order_id", "menu_item_id", "menu_item_name", "quantity", "unit_price", "selected_extras") VALUES 
('00ce49e8-ca4f-44ab-8abe-5bd0cb4a16a5', 'cc1e6a91-0cd5-499a-aeaa-981576d8be9b', '0ef3e6b9-a3c2-446d-887a-f22c1e6037b8', 'Crêpe Tuna', 1, '13.00', '[]'), 
('027da545-9d9e-4796-b843-a3f385932700', 'b10b96ab-caa1-4836-bf45-baea5ef6abbc', null, 'Sandwich Jambon', 1, '12.00', '[]'), 
('05033fec-b1be-4c60-88d8-87462ac44904', 'b9014dcf-590a-49ac-8b25-c47fdf6ca68f', '764294b6-2f1e-4e87-a563-a7c6a7d28d95', 'Espresso', 2, '3.50', '[]'), 
('0870cd46-bc01-40fa-a98d-3689d28ed0ba', 'c27dd1d0-aadb-4f40-97dd-c66e9ef3baeb', 'f822ce65-211b-4ed4-a60a-ed1d3c163744', 'Short Macchiato ', 1, '4.00', '[]'), 
('08f2cbaa-a30c-4741-9523-b866c900b48d', 'b9014dcf-590a-49ac-8b25-c47fdf6ca68f', 'c98c10e2-4cc8-4273-992a-06c268448200', 'Ice Spanish Latte aromatisé', 1, '10.00', '[]'), 
('09cc1068-fa34-4190-9a49-c0dbe47196f6', '11333ce2-c936-4b45-8426-0cc479899d00', '016963a6-0964-451d-87b0-8e3cbc7cc5ed', 'Milkshakes', 1, '11.00', '[]'), 
('11010ec2-553f-47e9-a139-a161af905ec0', '2e1a7f95-5272-4a32-a5a2-f37b2cc0178a', 'd99962fb-4ffc-453d-858b-73f80d4b600e', 'Frappuccino Speculos / Nutella / Snikers', 1, '13.50', '[]'), 
('1174d46e-d177-4794-aedf-1bbb764d7914', 'd04dc4ce-3cf0-4785-bfd5-07b76fe4aca2', 'b48a1c9f-d49a-4a04-87a2-50eb0980bfb1', 'Wake Up', 1, '19.00', '[]'), 
('19aa9521-9a5d-4a45-9f40-1cef22d5bb11', '5a53c8e6-2b0f-426c-b436-0e2ea5a6a573', '4e22c988-d0c9-44c6-b42b-f468f7fa440c', 'Petit Déjeuner Express', 1, '9.00', '[]'), 
('1c4ac04c-e2bf-4d43-88ca-208937096576', '29822515-4286-46f5-93db-bd6026441600', '34a7a360-59dc-465b-b143-1408fc4105e6', 'Black Rabbit Brunch (for two)', 1, '37.00', '[]'), 
('24a86754-9fd7-4f55-9ce0-88fd7b424357', '1a194c24-8de5-47b6-8e6e-8a2856f1dc16', '68382179-9b97-4a0e-8618-e609e60d3564', 'Jus', 2, '8.00', '[]'), 
('271dca04-afca-4a11-94de-0ff7228ff1da', 'c51fef66-ba0e-4bbb-ad66-d05986aa9ab7', '6c6c3b5d-08db-4999-93aa-49bdb8c92660', 'Ice Macchiato', 1, '9.50', '[]'), 
('27c7ed4c-3955-4501-bb1e-c710aa990afe', '880782f0-860d-4845-bb48-e3bab71ab46b', 'd39008a3-e0f8-4da8-99f1-8646c87d5648', 'PowerLeaf ', 1, '24.00', '[]'), 
('28ab968b-e329-4179-8240-46cdcfc57989', 'bee5732b-ccba-4714-afcf-7d20bc8902aa', '27c0e892-cca2-4c29-b918-3bb6ca047bfa', 'Soda', 1, '4.50', '[]'), 
('324a6c7d-0bfe-49da-8e9a-5c3ff0932755', 'b9014dcf-590a-49ac-8b25-c47fdf6ca68f', 'df92a75b-334f-401d-8dc2-23cc93251a11', 'Tiramisu Pistache ', 1, '11.00', '[]'), 
('32e51706-ed6c-465f-8808-01436d484996', '00529b36-1e02-4379-97c0-1760ce36cd1f', 'e6834d5c-e345-48cc-bfbc-08c08ae8a200', 'Crêpe Black Rabbit', 1, '16.00', '[]'), 
('393e84ad-2978-45b4-aabd-7304f3b35b3b', 'f0501aa7-daae-419e-9bc1-d20253bac34d', '0090d588-313b-45e3-b91e-d0fc7899926d', 'Cappuccino ', 1, '5.00', '[]'), 
('3e0efaf8-7346-4193-98e9-22444c836b3f', '75ee3043-fbc1-44e1-acbc-e1b5a0ba8e08', '34a7a360-59dc-465b-b143-1408fc4105e6', 'Black Rabbit Brunch (for two)', 1, '37.00', '[]'), 
('40a08c7d-82a5-44b5-996e-4967c1332f09', 'f27f4147-e1ec-4f05-a21c-9d2590af4807', 'd60733fe-2ecb-4cdd-9b4b-6fbd8fc3a0aa', 'Energetic Mojito ', 1, '12.50', '[]'), 
('4738fc5f-e032-4ab7-83dc-179827548cae', 'f361730b-1ec1-47c9-a1d6-b49b754e4f5c', '737a27c2-e19e-4b5d-9956-420793a226a3', '1/2 Eau', 1, '2.00', '[]'), 
('480d127d-2b49-4409-89fe-0b86d0f27886', 'ebc16914-2cb1-4231-893e-4ff89342b7a6', '737a27c2-e19e-4b5d-9956-420793a226a3', '1/2 Eau', 1, '2.00', '[]'), 
('4d7413be-ab91-4311-af8f-3832e6e54f1b', '00529b36-1e02-4379-97c0-1760ce36cd1f', 'e9c43987-bb51-4948-b25d-a8c813295fd2', 'TiraBox', 1, '9.50', '[]'), 
('4e3e5a81-be72-43a9-92c9-c03964ac0343', '7a5a3d30-8d2d-46e8-89c5-85dbeb2455b1', '34a7a360-59dc-465b-b143-1408fc4105e6', 'Black Rabbit Brunch (for two)', 1, '37.00', '[]'), 
('4eff2ced-1b45-47bd-af3e-e0fc8c1f5d02', '1e539d10-e077-4acc-a2a6-ec55bf4838c8', 'bff3075a-18fc-465f-8e18-7e43d6fad1e9', 'Waffle Addict', 1, '15.00', '[]'), 
('4fa0ad37-9059-4914-9feb-02a3bc370bc8', '2e1a7f95-5272-4a32-a5a2-f37b2cc0178a', 'f4955ba1-d36d-4ad3-a1ab-7388022185df', 'Affogato', 1, '9.00', '[]'), 
('5039d45f-7488-47d7-a3dd-e061fa7424bf', 'c27dd1d0-aadb-4f40-97dd-c66e9ef3baeb', '333922ac-cde0-4fd1-ac1b-23a75c23c856', 'Nespresso', 1, '6.00', '[]'), 
('50403c86-02c7-4741-b608-c5b23e31f6fa', '9f93ee04-9afa-418a-b0d9-46c6dee52abd', '764294b6-2f1e-4e87-a563-a7c6a7d28d95', 'Espresso', 1, '3.50', '[]'), 
('58d6a714-8af4-4142-a289-b06692e29fc9', '2b34d9ef-088c-48ea-bd62-6692840ee353', '764294b6-2f1e-4e87-a563-a7c6a7d28d95', 'Espresso', 1, '3.50', '[]'), 
('5a46b30a-ea18-4150-b73a-b142d06b2c70', '74b006a8-a529-4f51-962a-243862acba8c', '0df1bb63-c652-4d4c-bf9c-749572e4d9a2', 'Frappuccino Strawberry / Caramel', 1, '12.50', '[]'), 
('5b26c1d9-f57b-49e9-b3db-e5de0bd9db0b', '9db92e86-48b1-4332-bdbe-40948fb1794c', null, 'Ice Latte', 1, '10.00', '[{"name":"Lait d''avoine ","price":3}]'), 
('5ea1a88f-b851-4aee-959a-206e3870224b', '1ad326cc-e60e-4702-bc50-081b7740500c', 'bff3075a-18fc-465f-8e18-7e43d6fad1e9', 'Waffle Addict', 1, '15.00', '[]'), 
('643e33a2-0807-4502-9d38-f6a469333388', '2b34d9ef-088c-48ea-bd62-6692840ee353', '682f86f0-f09c-4c64-bd5d-8d938e1ebecd', 'Double Espresso', 1, '4.50', '[]'), 
('678d1437-06c2-4efc-bca2-b24183f0a132', 'ebc16914-2cb1-4231-893e-4ff89342b7a6', '764294b6-2f1e-4e87-a563-a7c6a7d28d95', 'Espresso', 1, '3.50', '[]'), 
('6fff3ede-827c-493a-8248-5e109c8c48be', 'd9f0e084-e191-4c60-8700-46af74a7d9af', 'e6834d5c-e345-48cc-bfbc-08c08ae8a200', 'Crêpe Black Rabbit', 1, '16.00', '[]'), 
('704103a8-b83f-4637-8c29-fce81a0c048c', '88ded1e8-d4b3-4866-80f6-2a7966fe7d3d', '5ecc38bf-2519-4900-9e93-d281876d9ff6', 'Classic Mojito', 1, '10.00', '[]'), 
('71ca69ee-f1de-4a18-8e09-38ed210ef4e2', '6786372c-146c-45ef-9a3b-fbe9ddfef372', '23a6240b-29e8-4d2b-b2cc-39446f7a0897', 'Tasty Dreaming', 1, '19.00', '[]'), 
('73657767-c69e-40c1-aab2-258e8501a5db', '0d13f3a2-f746-46aa-8789-791b0903c873', '34a7a360-59dc-465b-b143-1408fc4105e6', 'Black Rabbit Brunch (for two)', 1, '37.00', '[]'), 
('74c88e9e-7a96-481d-9a1d-8de588a404e7', 'f0501aa7-daae-419e-9bc1-d20253bac34d', 'a0f7fd1f-7cd6-4bc6-b252-750989ef294e', 'Ice Americano', 1, '6.00', '[]'), 
('7c30b87f-2899-43de-a681-acc6a0e609f4', '93759a11-6fee-4087-88eb-ff6721a0fe92', '764294b6-2f1e-4e87-a563-a7c6a7d28d95', 'Espresso', 1, '3.50', '[]'), 
('7d3c987d-f1ec-427b-8708-314e1c196c3c', 'd9f0e084-e191-4c60-8700-46af74a7d9af', '8a01458c-3a6f-465b-9023-705802109c01', 'Crêpe Tunisienne', 1, '15.00', '[]'), 
('824db111-4725-43fb-837f-ae5f29401440', 'd17cf1cb-8cd2-41ea-9e18-b8fb3d067cd2', '5ecc38bf-2519-4900-9e93-d281876d9ff6', 'Classic Mojito', 1, '11.50', '[]'), 
('8a2f23c4-1e1d-4af7-af47-7b863e55e7d2', '74b006a8-a529-4f51-962a-243862acba8c', '73900d88-0b49-47ab-94c6-6c7a4c99bb92', 'Cheesecake', 1, '13.00', '[]'), 
('8b64a769-ee0b-417c-8c79-6b17b82e5320', '6d317803-996c-46c6-8e09-47fe499ae9f0', 'c98c10e2-4cc8-4273-992a-06c268448200', 'Ice Spanish Latte aromatisé', 1, '10.00', '[]'), 
('8e94a66c-8da1-4816-84d6-245e795de864', 'cc1e6a91-0cd5-499a-aeaa-981576d8be9b', '4cf80831-027e-4b00-b326-4099be2887d1', 'Crêpe poulet pané', 1, '15.00', '[]'), 
('8fcfc0e6-151c-47f5-9467-fda26b8e2202', '1d953413-8dd4-4977-87f1-23ec864b32b5', '47cf889f-09bc-4d62-9066-3f163ba29489', 'Latte', 1, '4.50', '[]'), 
('9177e854-cd16-460e-8ccc-972a2cc0bf0b', '9f93ee04-9afa-418a-b0d9-46c6dee52abd', '0090d588-313b-45e3-b91e-d0fc7899926d', 'Cappuccino ', 1, '5.00', '[]'), 
('92a0d50c-d9be-4793-b8c1-276449650954', '814e8615-1672-4482-a991-499d285902c9', 'a553465f-6b6d-43ed-9249-c35d170481ff', 'Special Macchiato', 1, '12.50', '[{"name":"Nestlé","price":1}]'), 
('943c57d2-f325-42ab-bcc6-6928a56aaadf', '814e8615-1672-4482-a991-499d285902c9', 'c98c10e2-4cc8-4273-992a-06c268448200', 'Ice Spanish Latte aromatisé', 1, '11.00', '[{"name":"Arome","price":1}]'), 
('97e1b18a-c3b1-43aa-a452-9566e759aba1', '30602cff-5eab-4aa1-b246-cfacb7b2a3a9', '0ef3e6b9-a3c2-446d-887a-f22c1e6037b8', 'Crêpe Tuna', 1, '13.00', '[]'), 
('9cc12764-0064-4e02-9784-2554a0466f4f', 'b3f51c3b-2f26-4f52-ba94-14cbc9c376ec', '0090d588-313b-45e3-b91e-d0fc7899926d', 'Cappuccino ', 1, '5.00', '[]'), 
('9e217e94-0e37-4df6-b643-320d9d3197d7', '9a4c87d2-2faf-4e59-be21-c32c93f15ff1', 'a7680a4e-607c-4508-9e5a-42c379c77b1f', 'Frappuccino Chocolate / Moka / Hazelnut', 1, '11.50', '[]'), 
('a8100a57-7b47-4f91-badc-8815ba3d35fc', 'b3f51c3b-2f26-4f52-ba94-14cbc9c376ec', '34a7a360-59dc-465b-b143-1408fc4105e6', 'Black Rabbit Brunch (for two)', 1, '37.00', '[]'), 
('aac98c50-7190-4ec0-aa62-be4c59e86e11', '814e8615-1672-4482-a991-499d285902c9', 'f4955ba1-d36d-4ad3-a1ab-7388022185df', 'Affogato', 2, '9.00', '[]'), 
('acec2d8d-767e-4132-8a1d-9caad5f87df7', '9a1bffa5-095e-44dc-8b24-b33ec58cb10c', 'c98c10e2-4cc8-4273-992a-06c268448200', 'Ice Spanish Latte aromatisé', 1, '13.00', '[{"name":"Lait d''avoine ","price":3}]'), 
('af0dd14d-92ad-4f50-9aa6-4e37791f29d3', 'd17cf1cb-8cd2-41ea-9e18-b8fb3d067cd2', '5ecc38bf-2519-4900-9e93-d281876d9ff6', 'Classic Mojito', 1, '11.50', '[]'), 
('af3cbbbd-9993-4776-bd3e-f2a9dcc4292c', 'f361730b-1ec1-47c9-a1d6-b49b754e4f5c', '764294b6-2f1e-4e87-a563-a7c6a7d28d95', 'Espresso', 1, '3.50', '[]'), 
('b03ad1af-54d5-4ca3-b33e-331fab577a15', '1e6fb274-344e-41fe-a47e-e4c7b342cbfc', '34a7a360-59dc-465b-b143-1408fc4105e6', 'Black Rabbit Brunch (for two)', 1, '37.00', '[]'), 
('b043f529-62e9-46d1-a22d-afd346152f34', 'f361730b-1ec1-47c9-a1d6-b49b754e4f5c', '73900d88-0b49-47ab-94c6-6c7a4c99bb92', 'Cheesecake', 1, '10.00', '[]'), 
('b1467e6e-8f2b-4b82-af3a-1c0e2b3248d6', '30602cff-5eab-4aa1-b246-cfacb7b2a3a9', '4cf80831-027e-4b00-b326-4099be2887d1', 'Crêpe poulet pané', 1, '15.00', '[]'), 
('b2047cfa-ff72-4740-a782-ffce6bc1cccd', 'cc1e6a91-0cd5-499a-aeaa-981576d8be9b', '5ecc38bf-2519-4900-9e93-d281876d9ff6', 'Classic Mojito', 2, '10.00', '[]'), 
('b411af49-f2fa-4c66-a54c-1e069760b043', '1d953413-8dd4-4977-87f1-23ec864b32b5', '07982470-4b53-4c33-8dc8-4cdfa33a3d59', 'Crêpe Pistachio', 1, '14.00', '[]'), 
('b438457f-fcdd-4c5e-8e02-86ef57ee0bff', '9f124bf0-b069-4c44-af9e-fbc6a87038a5', '9ba9bdb5-5d06-4d40-81a3-78373e6eefb4', 'Fondant Nutella', 1, '10.00', '[]'), 
('bba17742-0a29-4c40-9fb3-0849bdcf05f3', 'd17cf1cb-8cd2-41ea-9e18-b8fb3d067cd2', 'c240a46b-5ea5-4286-810b-3af85968309d', 'Club Sandwich ', 1, '12.00', '[]'), 
('c2e1e958-53f1-4305-b97b-bb1c7853f389', '93759a11-6fee-4087-88eb-ff6721a0fe92', 'f822ce65-211b-4ed4-a60a-ed1d3c163744', 'Capucin', 1, '4.00', '[]'), 
('c860c1a8-cbae-404c-8012-5732f8b5931b', 'c49f1f36-89e1-4cb4-bce0-bff2729b0bd8', 'f4955ba1-d36d-4ad3-a1ab-7388022185df', 'Affogato', 2, '9.00', '[]'), 
('ca2264a3-26f9-4c82-9879-4443dbfdff44', '158947f4-08e1-4163-922c-03f8a3605380', '34a7a360-59dc-465b-b143-1408fc4105e6', 'Black Rabbit Brunch (for two)', 1, '37.00', '[]'), 
('cc8e7fb9-5064-4d50-805d-806949f03279', '4399cb34-ff63-4d34-be0b-5a20e2737e24', 'f711bbc7-92f1-400b-8f59-d32ea7bd0e17', 'Citronade', 1, '10.00', '[]'), 
('ce618780-5b44-4473-ae44-a34f9a80ee14', '11333ce2-c936-4b45-8426-0cc479899d00', '8c835dd5-2c7f-417e-addf-ae02185d6b1a', 'Tacos Poulet Pané', 1, '13.00', '[]'), 
('d625ab38-43a3-4658-89fe-9caa0a1664f4', '30602cff-5eab-4aa1-b246-cfacb7b2a3a9', '8c835dd5-2c7f-417e-addf-ae02185d6b1a', 'Tacos Poulet Pané', 1, '13.00', '[]'), 
('d7f319fc-c5ea-46d3-917f-8191d283e1a0', '5b468952-3704-43f6-91a3-645b9279c14c', '23a6240b-29e8-4d2b-b2cc-39446f7a0897', 'Tasty Dreaming', 1, '19.00', '[]'), 
('d88735ff-809c-4ed9-8d03-af6243b9da3d', 'c49f1f36-89e1-4cb4-bce0-bff2729b0bd8', '69acded0-19b0-4b14-ab73-81942fd77bad', 'Boules Nutella / Mordjene', 1, '13.00', '[]'), 
('dbcd5630-75d3-4696-9940-0f2c070c9c83', '9a4c87d2-2faf-4e59-be21-c32c93f15ff1', '9ba9bdb5-5d06-4d40-81a3-78373e6eefb4', 'Fondant Nutella', 1, '10.00', '[]'), 
('deddeb87-c3a3-4e9a-8df6-e8061875fdd2', '9db92e86-48b1-4332-bdbe-40948fb1794c', '4cf80831-027e-4b00-b326-4099be2887d1', 'Crêpe poulet pané', 1, '15.00', '[]'), 
('e5a8c3de-b022-4b60-818e-5e0fba3d22d5', '9a1bffa5-095e-44dc-8b24-b33ec58cb10c', '4cf80831-027e-4b00-b326-4099be2887d1', 'Crêpe poulet pané', 1, '15.00', '[]'), 
('e6c5a5b0-f8f1-4c44-8998-a94bb28fdea3', '9f124bf0-b069-4c44-af9e-fbc6a87038a5', '37bb5013-48a6-4a6d-bbb8-511fb21096dd', 'Sandwich Poulet Pané', 1, '13.00', '[]'), 
('ee62f5c3-b954-4277-a628-a9a485a57cd2', 'b9014dcf-590a-49ac-8b25-c47fdf6ca68f', '69acded0-19b0-4b14-ab73-81942fd77bad', 'Boules Nutella / Mordjene', 1, '13.00', '[]'), 
('f713477e-1a54-4197-8696-89f75962101a', '880782f0-860d-4845-bb48-e3bab71ab46b', '4e22c988-d0c9-44c6-b42b-f468f7fa440c', 'Petit Déjeuner Express', 1, '9.00', '[]'), 
('f7a6ab6d-2a21-483d-97d4-75e7e019b0eb', '90993369-e47d-4c64-9a7d-9e2fddacf2cd', '34a7a360-59dc-465b-b143-1408fc4105e6', 'Black Rabbit Brunch (for two)', 1, '37.00', '[]'), 
('f9731fd9-06d0-4b06-8dac-089214ff3d2b', 'b9974291-b908-46bc-b28d-9e30c44eeb03', '34a7a360-59dc-465b-b143-1408fc4105e6', 'Black Rabbit Brunch (for two)', 1, '37.00', '[]'), 
('fce9c5ac-0bb1-42a5-825f-1d3587b8dd23', '0318aa9b-de58-46b6-9960-154f3c653c7d', '4e22c988-d0c9-44c6-b42b-f468f7fa440c', 'Petit Déjeuner Express', 2, '9.00', '[]'), 
('ffc29606-ec44-43fb-b0cf-ddcfbdb3ded7', '9f124bf0-b069-4c44-af9e-fbc6a87038a5', '47cf889f-09bc-4d62-9066-3f163ba29489', 'Latte Macchiato', 2, '4.50', '[]');

-- Delivery Orders
INSERT INTO "public"."delivery_orders" ("id", "customer_name", "customer_phone", "customer_address", "items", "subtotal", "delivery_fee", "total", "notes", "status", "created_at", "updated_at", "tracking_code") VALUES 
('045e77c7-2737-488d-b033-c59b2aece734', 'Yasmine', '26100248', 'Petit pêcheur', '[{"quantity":1,"unitPrice":9,"menuItemId":"6733741d-cd54-491a-9b8a-61de14582026","menuItemName":"Tiramisu Ball 4 Pièces"}]', '9', '3', '12', null, 'delivered', '2026-05-13 15:58:57.737362+00', '2026-05-13 15:58:57.737362+00', 'BR-1HU3U'), 
('15603042-16ef-41ec-8876-62a3f213ee06', 'Saddem Massaoud', '22787023', 'https://www.google.com/maps?q=36.837886488832815,11.097965946999276', '[{"quantity":1,"unitPrice":15,"menuItemId":"4cf80831-027e-4b00-b326-4099be2887d1","menuItemName":"Crêpe poulet pané"},{"quantity":1,"unitPrice":3.5,"menuItemId":"764294b6-2f1e-4e87-a563-a7c6a7d28d95","menuItemName":"Espresso"}]', '18.50', '3.00', '21.50', null, 'delivered', '2026-04-16 19:32:16.931851+00', '2026-04-16 19:33:22.206364+00', 'BR-PU614'), 
('159b9b7e-43b1-42d6-b718-5ae0f973089c', 'Yasmine Makhlouf', '90357407', 'Près de zenobia belge', '[{"quantity":1,"unitPrice":13,"menuItemId":"8c835dd5-2c7f-417e-addf-ae02185d6b1a","menuItemName":"Tacos Poulet Pané"},{"quantity":1,"unitPrice":12.5,"menuItemId":"0df1bb63-c652-4d4c-bf9c-749572e4d9a2","variantName":"Caramel","menuItemName":"Frappuccino Strawberry / Caramel"}]', '25.5', '3', '28.5', 'Tacos mouch 7ar', 'delivered', '2026-06-03 16:22:42.287237+00', '2026-06-03 16:22:42.287237+00', 'BR-A427S'), 
('16aecfe6-2863-4a05-8991-592d92dfd54f', 'Saddem Massaoud', '22787023', 'https://www.google.com/maps?q=36.83790905638286,11.098018496948736', '[{"quantity":1,"unitPrice":3.5,"menuItemId":"764294b6-2f1e-4e87-a563-a7c6a7d28d95","menuItemName":"Espresso"},{"quantity":1,"unitPrice":15,"menuItemId":"cc56f57f-f1bc-4ebe-97e2-7ef4bc360554","menuItemName":"Dutch Pancake"}]', '18.50', '3.00', '21.50', null, 'cancelled', '2026-04-18 17:29:27.978682+00', '2026-04-18 18:23:02.35048+00', 'BR-C15DW'), 
('33edf4e6-5ed7-4a53-a6d1-3a263c3e05eb', 'Lynda gouider', '50702315', 'Park auto ecole', '[{"quantity":1,"unitPrice":17,"menuItemId":"56462f9a-e6eb-42bc-87cc-64b425533226","menuItemName":"Black Rabbit Box"}]', '17', '3', '20', null, 'delivered', '2026-05-31 17:49:59.977145+00', '2026-05-31 17:49:59.977145+00', 'BR-9QAK1'), 
('341c68c7-1367-4a1e-b847-a360aba14335', 'Yasmine makhlouf', '90357407', 'Près de zenobia', '[{"quantity":1,"unitPrice":9.5,"menuItemId":"6c6c3b5d-08db-4999-93aa-49bdb8c92660","optionName":"Caramel ","menuItemName":"Ice Macchiato"},{"quantity":1,"unitPrice":13,"menuItemId":"8c835dd5-2c7f-417e-addf-ae02185d6b1a","menuItemName":"Tacos Poulet Pané"}]', '22.5', '3', '25.5', 'Tacos mouch 7ar', 'delivered', '2026-06-05 14:48:57.3363+00', '2026-06-05 14:48:57.3363+00', 'BR-OVTK8'), 
('3793805c-068e-4378-a4f6-5e1dcc1f591d', 'Saddem Massaoud', '22787023', 'https://www.google.com/maps?q=36.8469799151962,11.106804227028796', '[{"quantity":1,"unitPrice":15,"menuItemId":"4cf80831-027e-4b00-b326-4099be2887d1","menuItemName":"Crêpe poulet pané"},{"quantity":1,"unitPrice":3.5,"menuItemId":"764294b6-2f1e-4e87-a563-a7c6a7d28d95","menuItemName":"Espresso"}]', '18.50', '3.00', '21.50', null, 'delivered', '2026-04-10 23:00:46.37152+00', '2026-04-10 23:01:53.138356+00', 'BR-L8D3V'), 
('37a0d4ec-43ef-4fa6-8f4c-bacd54c0a69f', 'assil', '+216 50468798', 'https://www.google.com/maps?q=36.76070402752365,10.269893544193211', '[{"quantity":1,"unitPrice":15,"menuItemId":"4cf80831-027e-4b00-b326-4099be2887d1","menuItemName":"Crêpe poulet pané"},{"quantity":1,"unitPrice":9.5,"menuItemId":"abd0cdff-f2f5-45bf-bad0-bea72132d34a","menuItemName":"Fraisier"},{"quantity":1,"unitPrice":11,"menuItemId":"df92a75b-334f-401d-8dc2-23cc93251a11","menuItemName":"Tiramisu Pistache "},{"quantity":1,"unitPrice":12,"menuItemId":"c240a46b-5ea5-4286-810b-3af85968309d","menuItemName":"Club Sandwich "},{"quantity":1,"unitPrice":9,"menuItemId":"4e22c988-d0c9-44c6-b42b-f468f7fa440c","menuItemName":"Petit Déjeuner Express"},{"quantity":1,"unitPrice":9,"menuItemId":"6733741d-cd54-491a-9b8a-61de14582026","menuItemName":"Tiramisu Ball 4 Pièces"},{"quantity":1,"unitPrice":13,"menuItemId":"1007b242-2738-41ad-bc31-a7b7d0231580","menuItemName":"Crêpe Nutella / Mordjene "},{"quantity":1,"unitPrice":3.5,"menuItemId":"0127c875-c0b6-4e67-b6a7-382ef2da35b5","menuItemName":"Eau Plate"},{"quantity":1,"unitPrice":8,"menuItemId":"0fc90b9c-8c9d-403e-a9de-8260e71652df","menuItemName":"Croissant Salé Façon Chef"},{"quantity":1,"unitPrice":12,"menuItemId":"62d0cc8e-db06-450f-98d3-7dc96e5e9bcb","menuItemName":"Sandwich Jambon"},{"quantity":1,"unitPrice":11,"menuItemId":"016963a6-0964-451d-87b0-8e3cbc7cc5ed","optionName":"Spéculos ","menuItemName":"Milkshakes"},{"quantity":1,"unitPrice":13,"menuItemId":"8c835dd5-2c7f-417e-addf-ae02185d6b1a","menuItemName":"Tacos Poulet Pané"},{"quantity":1,"unitPrice":6,"menuItemId":"a0f7fd1f-7cd6-4bc6-b252-750989ef294e","menuItemName":"Ice Americano"},{"quantity":1,"unitPrice":11.5,"menuItemId":"a7680a4e-607c-4508-9e5a-42c379c77b1f","variantName":"Chocolate ","menuItemName":"Frappuccino Chocolate / Moka / Hazelnut"},{"quantity":1,"unitPrice":3,"menuItemId":"b880f815-8ac1-4296-bd32-ca71026a0eba","menuItemName":"Sirop"},{"quantity":1,"unitPrice":10,"menuItemId":"9ba9bdb5-5d06-4d40-81a3-78373e6eefb4","menuItemName":"Fondant Nutella"},{"quantity":1,"unitPrice":15,"menuItemId":"bff3075a-18fc-465f-8e18-7e43d6fad1e9","menuItemName":"Pancake Addict"},{"quantity":1,"unitPrice":18,"menuItemId":"809bb327-6624-47a9-9eb3-a742fa4ac680","menuItemName":"Boules Black Rabbit"},{"quantity":1,"unitPrice":13,"menuItemId":"b211a93c-4315-4f7e-b858-e2f45a90f9be","menuItemName":"Crêpe Orientale"},{"quantity":1,"unitPrice":4.5,"menuItemId":"27c0e892-cca2-4c29-b918-3bb6ca047bfa","menuItemName":"Soda"},{"quantity":1,"unitPrice":4,"menuItemId":"c6514449-a8b1-4909-bb6d-0bc5eb386b44","menuItemName":"Americano"},{"quantity":1,"unitPrice":19,"menuItemId":"23a6240b-29e8-4d2b-b2cc-39446f7a0897","menuItemName":"Tasty Dreaming"},{"quantity":1,"unitPrice":13,"menuItemId":"7a29221c-1781-473d-b3c7-06a1396ec22d","menuItemName":"Boules Bianca"},{"quantity":1,"unitPrice":15,"menuItemId":"5d0edda2-6d25-4c04-94ac-ec771ee65b25","menuItemName":"Crêpe Bombay"},{"quantity":1,"unitPrice":12,"menuItemId":"02979ad5-63d8-4df7-8b52-202a5b849ca6","menuItemName":"Gâteaux au Choix"},{"quantity":1,"unitPrice":10,"menuItemId":"d6c1bfb5-c293-4db4-8cac-b5247b441736","menuItemName":"Crêpe Bianca"},{"quantity":1,"unitPrice":9,"menuItemId":"f4955ba1-d36d-4ad3-a1ab-7388022185df","menuItemName":"Affogato"},{"quantity":1,"unitPrice":11,"menuItemId":"865cfdc3-7cfa-475c-809f-2cc4352bd7ff","menuItemName":"Red Bull"},{"quantity":1,"unitPrice":19,"menuItemId":"b48a1c9f-d49a-4a04-87a2-50eb0980bfb1","menuItemName":"Wake Up"},{"quantity":1,"unitPrice":15,"menuItemId":"8a01458c-3a6f-465b-9023-705802109c01","menuItemName":"Crêpe Tunisienne"},{"quantity":1,"unitPrice":7,"menuItemId":"d46a70d0-f7ba-48cd-87ac-b4f16cdb7bff","menuItemName":"Vanilla Latte"},{"quantity":1,"unitPrice":12,"menuItemId":"465bd175-9fbc-4964-a734-ec80afbab842","menuItemName":"Ice Matcha Revisité"},{"quantity":1,"unitPrice":10.5,"menuItemId":"9f79eaae-bca7-4590-9267-92f626a74163","menuItemName":"Hot Chocolate"},{"quantity":1,"unitPrice":37,"menuItemId":"34a7a360-59dc-465b-b143-1408fc4105e6","menuItemName":"Black Rabbit Brunch (for two)"},{"quantity":1,"unitPrice":5,"menuItemId":"e28e7ec8-ed92-4625-8fa4-d213d1767227","menuItemName":"Kyufi Tea"},{"quantity":2,"unitPrice":12.5,"menuItemId":"8886dea7-781b-4576-be40-2256d38fa3ec","variantName":"Avec Arome","menuItemName":"Latte Matcha"},{"quantity":1,"unitPrice":9.5,"menuItemId":"8886dea7-781b-4576-be40-2256d38fa3ec","variantName":"Classic ","menuItemName":"Latte Matcha"}]', '440', '3', '443', null, 'cancelled', '2026-05-13 10:22:39.979291+00', '2026-05-13 10:22:39.979291+00', 'BR-Y3R5A'), 
('38e36eca-1bdd-4e65-a329-48702d177d6a', 'Nafissa makhlouf', '90357407', 'Près de cafe magnifique', '[{"quantity":1,"unitPrice":13,"menuItemId":"8c835dd5-2c7f-417e-addf-ae02185d6b1a","menuItemName":"Tacos Poulet Pané"}]', '13', '3', '16', 'Mch 7ar', 'delivered', '2026-05-31 16:03:10.802564+00', '2026-05-31 16:03:10.802564+00', 'BR-8A8DK'), 
('3fec43a6-f9d4-44cf-a834-8b3de0eb9380', 'Saddem Massaoud', '22787023', 'https://www.google.com/maps?q=36.84698660958608,11.106809759712906', '[{"quantity":1,"unitPrice":15,"menuItemId":"4cf80831-027e-4b00-b326-4099be2887d1","menuItemName":"Crêpe poulet pané"},{"quantity":1,"unitPrice":3.5,"menuItemId":"764294b6-2f1e-4e87-a563-a7c6a7d28d95","menuItemName":"Espresso"},{"quantity":1,"unitPrice":15,"menuItemId":"cc56f57f-f1bc-4ebe-97e2-7ef4bc360554","menuItemName":"Dutch Pancake"}]', '33.50', '3.00', '36.50', null, 'cancelled', '2026-04-10 23:00:18.321226+00', '2026-04-13 18:19:23.199903+00', 'BR-EW067'), 
('4d1bc755-9af5-4d2a-a8c1-0c6b039a47e8', 'omar lengliz', '+21629761297', 'https://www.google.com/maps?q=36.84711442215899,11.096939040073705', '[{"quantity":1,"unitPrice":12,"menuItemId":"c240a46b-5ea5-4286-810b-3af85968309d","menuItemName":"Club Sandwichs "}]', '12.00', '3.00', '15.00', null, 'cancelled', '2026-04-24 07:49:29.339418+00', '2026-04-24 09:10:07.622632+00', 'BR-R8P9F'), 
('4eab9403-031e-4c95-95fe-fa9f2f67ea7b', 'Saddem Massaoud', '22787023', 'https://www.google.com/maps?q=36.8379172970336,11.098039976753986', '[{"quantity":1,"unitPrice":4,"menuItemId":"f822ce65-211b-4ed4-a60a-ed1d3c163744","menuItemName":"Short Macchiato "}]', '4', '3', '7', null, 'cancelled', '2026-05-16 09:23:16.459407+00', '2026-05-16 09:23:16.459407+00', 'BR-9U3NJ'), 
('4f7c1f02-e53d-46e9-b297-a218097ca63e', 'Sadem', '22787023', 'https://www.google.com/maps?q=36.8463776357404,11.092250421397155', '[{"quantity":1,"unitPrice":15,"menuItemId":"4cf80831-027e-4b00-b326-4099be2887d1","menuItemName":"Crêpe poulet pané"},{"quantity":1,"unitPrice":13,"menuItemId":"1007b242-2738-41ad-bc31-a7b7d0231580","menuItemName":"Crêpe Nutella / Factory Chocolate"}]', '28.00', '3.00', '31.00', null, 'delivered', '2026-04-13 15:39:48.869386+00', '2026-04-13 15:40:40.300429+00', 'BR-BJBGF'), 
('533fcb4b-809e-4369-89a5-83ae80c48453', 'Farrah', '500422655', 'https://maps.app.goo.gl/XHg1DiGkmA5kFBh27?g_st=ac', '[{"quantity":1,"unitPrice":10,"menuItemId":"f711bbc7-92f1-400b-8f59-d32ea7bd0e17","variantName":"Citronade glacé","menuItemName":"Citronade"},{"quantity":1,"unitPrice":14,"menuItemId":"07982470-4b53-4c33-8dc8-4cdfa33a3d59","menuItemName":"Crêpe Pistachio"}]', '24', '3', '27', 'Pas de creme a l''extérieur SVP', 'delivered', '2026-05-30 16:28:26.049242+00', '2026-05-30 16:28:26.049242+00', 'BR-KDQCH'), 
('5cf2de4b-e298-4bbe-8531-faf4e724c77f', 'Taher', '+216 25965252', 'Mansoura', '[{"quantity":1,"unitPrice":13,"menuItemId":"73900d88-0b49-47ab-94c6-6c7a4c99bb92","menuItemName":"Cheesecake"},{"quantity":1,"unitPrice":10.5,"menuItemId":"68382179-9b97-4a0e-8618-e609e60d3564","variantName":"Banane","menuItemName":"Jus"}]', '23.5', '3', '26.5', null, 'cancelled', '2026-05-13 10:25:48.683379+00', '2026-05-13 10:25:48.683379+00', 'BR-TZDWB'), 
('62a9c06e-2d75-4e83-bc24-2dbe4dff50f7', 'Mahfoudh Salma', '20785780', 'citée bosten chiwa', '[{"quantity":1,"unitPrice":11,"menuItemId":"016963a6-0964-451d-87b0-8e3cbc7cc5ed","optionName":"Oreo","menuItemName":"Milkshakes"},{"quantity":1,"unitPrice":11,"menuItemId":"df92a75b-334f-401d-8dc2-23cc93251a11","menuItemName":"Tiramisu Pistache "}]', '22', '3', '25', '..', 'delivered', '2026-05-15 17:28:02.227148+00', '2026-05-15 17:28:02.227148+00', 'BR-QXUDF'), 
('749abf97-9ef8-411c-8fa0-789570bfae99', 'Saddem Massaoud', '22787023', 'https://www.google.com/maps?q=36.83789616670382,11.097965333933981', '[{"quantity":1,"unitPrice":18,"menuItemId":"f66660dc-5f7b-4fe6-8f17-24dda4b43bfb","menuItemName":"Tagliatelle"},{"quantity":1,"unitPrice":3,"menuItemId":"b880f815-8ac1-4296-bd32-ca71026a0eba","menuItemName":"Sirop"}]', '21.00', '3.00', '24.00', null, 'delivered', '2026-04-19 10:55:49.953144+00', '2026-04-19 10:56:30.880487+00', 'BR-YS8MN'), 
('779ab336-a87c-462e-be08-f665f71c35dd', 'Yasmine', '26100248', 'Petit pêcheur', '[{"quantity":1,"unitPrice":9,"menuItemId":"6733741d-cd54-491a-9b8a-61de14582026","menuItemName":"Tiramisu Ball 4 Pièces"}]', '9', '3', '12', null, 'delivered', '2026-05-13 15:56:15.843697+00', '2026-05-13 15:56:15.843697+00', 'BR-8V0AL'), 
('84a8cf8e-34fa-4cc1-af0a-3d56ce6459c4', 'Sadem', '22787023', 'https://www.google.com/maps?q=36.8379582913359,11.098015585320985', '[{"quantity":1,"unitPrice":15,"menuItemId":"4cf80831-027e-4b00-b326-4099be2887d1","menuItemName":"Crêpe poulet pané"},{"quantity":1,"unitPrice":3.5,"menuItemId":"764294b6-2f1e-4e87-a563-a7c6a7d28d95","menuItemName":"Espresso"}]', '18.50', '4.00', '22.50', null, 'delivered', '2026-04-10 18:38:25.833217+00', '2026-04-10 18:40:16.924132+00', 'BR-TFUG6'), 
('8702d031-c9b9-42a9-96e2-8170baccd2ba', 'Takeli Ryem', '29274035', 'https://maps.app.goo.gl/Ed9paHthAB8v5csAA', '[{"quantity":3,"unitPrice":13,"menuItemId":"8c835dd5-2c7f-417e-addf-ae02185d6b1a","menuItemName":"Tacos Poulet Pané"}]', '39', '3', '42', 'Un peu de harissa svp', 'delivered', '2026-05-14 17:30:58.921707+00', '2026-05-14 17:30:58.921707+00', 'BR-0R79I'), 
('8da71650-a818-4bc9-8c62-f956265be4ee', 'Hs', '57578', 'https://www.google.com/maps?q=36.847013408520084,11.106811012854239', '[{"quantity":1,"unitPrice":13,"menuItemId":"1007b242-2738-41ad-bc31-a7b7d0231580","menuItemName":"Crêpe Nutella / Factory Chocolate"},{"quantity":1,"unitPrice":13,"menuItemId":"f2c3c313-527d-42b7-a8f6-e44b08c34b09","menuItemName":"Crêpe Cheesy"}]', '26.00', '3.00', '29.00', null, 'cancelled', '2026-04-15 11:23:56.931786+00', '2026-04-15 11:50:06.930673+00', 'BR-0DQUJ'), 
('9a492c53-b697-4c81-bfd5-33a7d22a3dbf', 'Eya Najjar', '50168624', 'Rue baghded\n2: Hay riadh 2', '[{"quantity":2,"unitPrice":13,"menuItemId":"8c835dd5-2c7f-417e-addf-ae02185d6b1a","menuItemName":"Tacos Poulet Pané"}]', '26', '3', '29', null, 'delivered', '2026-05-24 17:41:00.517181+00', '2026-05-24 17:41:00.517181+00', 'BR-ED35V'), 
('9adcfec6-cfc7-4379-9038-9bf9774344e7', 'Farrah', '+21650042265', 'La premiere rue a gauche sur la route de la mansoura', '[{"quantity":1,"unitPrice":10,"menuItemId":"f711bbc7-92f1-400b-8f59-d32ea7bd0e17","variantName":"Citronade glacé","menuItemName":"Citronade"},{"quantity":1,"unitPrice":12,"menuItemId":"c240a46b-5ea5-4286-810b-3af85968309d","menuItemName":"Club Sandwich "},{"quantity":1,"unitPrice":11,"menuItemId":"df92a75b-334f-401d-8dc2-23cc93251a11","menuItemName":"Tiramisu Pistache "}]', '33', '3', '36', null, 'delivered', '2026-05-31 12:49:27.830273+00', '2026-05-31 12:49:27.830273+00', 'BR-JIV4R'), 
('a235b3a8-1e60-41bb-b04f-40798c190a1f', 'Nour Ridene', '53373700', 'https://maps.app.goo.gl/Uz3w7FkBM6cVPf55A?g_st=ic', '[{"quantity":1,"unitPrice":37,"menuItemId":"34a7a360-59dc-465b-b143-1408fc4105e6","menuItemName":"Black Rabbit Brunch (for two)"}]', '37', '3', '40', null, 'delivered', '2026-06-02 10:03:25.837292+00', '2026-06-02 10:03:25.837292+00', 'BR-M3Z1T'), 
('b8435c3b-a302-450e-910e-2ca72eba5275', 'Saddem Massaoud', '22787023', 'https://www.google.com/maps?q=36.837921349471436,11.098065803364063', '[{"quantity":1,"unitPrice":3.5,"menuItemId":"764294b6-2f1e-4e87-a563-a7c6a7d28d95","menuItemName":"Espresso"},{"quantity":1,"unitPrice":18,"menuItemId":"f66660dc-5f7b-4fe6-8f17-24dda4b43bfb","menuItemName":"Tagliatelle"}]', '21.50', '3.00', '24.50', null, 'delivered', '2026-04-20 19:06:53.373991+00', '2026-04-20 19:07:39.28879+00', 'BR-CN3VK'), 
('b99d145b-00d5-4e55-9b9e-ee641bbe2c15', 'Saddem Massaoud', '22787023', 'https://www.google.com/maps?q=36.837958518009685,11.098015698615598', '[{"quantity":1,"unitPrice":15,"menuItemId":"4cf80831-027e-4b00-b326-4099be2887d1","menuItemName":"Crêpe poulet pané"},{"quantity":1,"unitPrice":3.5,"menuItemId":"764294b6-2f1e-4e87-a563-a7c6a7d28d95","menuItemName":"Espresso"}]', '18.50', '4.00', '22.50', null, 'delivered', '2026-04-10 18:25:40.528915+00', '2026-04-10 18:27:09.900594+00', 'BR-4EXSR'), 
('c6be5176-1546-45b7-aca3-3c66d8ed91f8', 'Mariem elbey', '93621668', 'https://www.google.com/maps?q=36.84278029480897,11.089252452666322', '[{"quantity":1,"unitPrice":19,"menuItemId":"23a6240b-29e8-4d2b-b2cc-39446f7a0897","menuItemName":"Tasty Dreaming"}]', '19', '3', '22', null, 'cancelled', '2026-05-25 07:53:44.2119+00', '2026-05-25 07:53:44.2119+00', 'BR-X7SVV'), 
('c7c2902b-5cd5-44b7-86bc-7fe34f1ae8e0', 'Zayneb traki', '27662133', 'Kelibia \n3: Rue du cartage', '[{"quantity":1,"unitPrice":13,"menuItemId":"8c835dd5-2c7f-417e-addf-ae02185d6b1a","menuItemName":"Tacos Poulet Pané"}]', '13', '3', '16', 'Sans hrisaa', 'delivered', '2026-05-29 17:03:06.895474+00', '2026-05-29 17:03:06.895474+00', 'BR-6PSE4'), 
('d5f54fe2-da05-42f2-b5aa-f0cadbc5d315', 'Farrah', '50042265', 'https://www.google.com/maps/place/36%C2%B050''48.8%22N+11%C2%B007''19.7%22E/@36.8468801,11.1214943,19z/data=!3m1!4b1!4m4!3m3!8m2!3d36.846879!4d11.122138?entry=ttu&g_ep=EgoyMDI2MDUyNy4wIKXMDSoASAFQAw%3D%3D', '[{"quantity":1,"unitPrice":13,"menuItemId":"8c835dd5-2c7f-417e-addf-ae02185d6b1a","menuItemName":"Tacos Poulet Pané"},{"quantity":1,"unitPrice":10,"menuItemId":"73900d88-0b49-47ab-94c6-6c7a4c99bb92","menuItemName":"Cheesecake"},{"quantity":1,"unitPrice":3.5,"menuItemId":"0127c875-c0b6-4e67-b6a7-382ef2da35b5","menuItemName":"Eau Plate"}]', '26.5', '3', '29.5', null, 'delivered', '2026-06-01 18:22:35.626873+00', '2026-06-01 18:22:35.626873+00', 'BR-094FT');

-- Push Subscriptions
INSERT INTO "public"."push_subscriptions" ("id", "user_id", "endpoint", "p256dh", "auth_key", "created_at") VALUES 
('53ea04e5-a275-4b71-8dea-487884d6f313', '5229fdee-ce2a-4917-96dc-7397f25004b7', 'https://fcm.googleapis.com/fcm/send/cwjharXJY28:APA91bF2gBbDEVFcIl7NLHJv_Q86x0Kk9EdO13tAL6CMV5jnGXbejutlMMrHdn0HX5ZiS50iWYk9AU93SaKvK1-5-B_9dxhvJuBSILvSQ8_lcRUBbZI97qvXiJeNOpZplGC6OI2moXn-', 'BBVaXX9C5an6R7JqVdMVsIGe4DDlVIk-u9kZmTfF0SEtzDPvb9CANj_VWd_eGH-1ia7u42Hb1NtZkNqsKCgMLYw', 'NQKmrBsfDChisoKOncJRdg', '2026-05-12 13:57:32.053774+00'), 
('df43eb3f-b99e-4c69-ba1d-ca022066b3f4', '5229fdee-ce2a-4917-96dc-7397f25004b7', 'https://web.push.apple.com/QIiBD_AfP0VsqjaT_q7E13TQpNIM3rBm3Ke0xmfecO84zF2bCrdVeIpkTZg1HzhYwB0acjgfhUdf2rnSzwKKGj-rXy4_wMdKCqGGlGYQkPcxV8iNyYI_urUKQHuv7w0POVBXgmXU93MEGILZVYcffWY4fmKCnEbQT7yM9G5Udxw', 'BIfSKULFnr88t8OX64QO0RXqwQVEDX81nOaeSTyA1faLPP7fZ8FOrsp3GMSZsmJ0tW2cy1IJU7dq0pZvQNeM-Y0', 'H05inwRpXkc2J91aI4DGqQ', '2026-05-09 12:03:14.37813+00'), 
('ec5a9160-653a-44c1-bc1a-7827245ecc07', '5229fdee-ce2a-4917-96dc-7397f25004b7', 'https://web.push.apple.com/QBlY-OzfVrCjFZTTBsKzvX0Q2SpOmq2ZAfPMR7GVsj6noHuTnFhY6m6eEdu5Ig4UU35Hkszbgw1hgIV4e7p_AdoVBPNeH6Ja8pcyD3GyHQYJu0SP5dh1ZdymrKSO-IFvwJULry5FtYeoE8kxUWM415GQEBMYwZQVHNA3lC0yKFU', 'BG4319N6xsdPITsgGiSTQmhKYZyspNtlREPapBsRdYNE4EhFxT3QMKUkVoMoNgBE6vQRNoTte0IAgQbZRXhS-Wc', 'H4nzwWbN1bayNa0Fkc1C3g', '2026-05-12 12:59:43.625242+00');

-- Push Logs
INSERT INTO "public"."push_logs" ("tag", "created_at") VALUES 
('order-12223ab2-7bc9-4473-9cfe-b6e29b8182b2', '2026-05-05 19:01:24.444024+00'), 
('order-1ad326cc-e60e-4702-bc50-081b7740500c', '2026-04-24 10:45:26.621892+00'), 
('order-1e539d10-e077-4acc-a2a6-ec55bf4838c8', '2026-04-24 10:47:28.770012+00'), 
('order-3a46dd01-1156-496c-aeac-49c4bd05bae9', '2026-04-24 07:51:24.68358+00'), 
('order-9f124bf0-b069-4c44-af9e-fbc6a87038a5', '2026-05-08 16:47:37.084024+00'), 
('order-undefined', '2026-04-24 08:58:46.971024+00'), 
('res-41c2f9e3-b73c-4986-9d21-773855e34222', '2026-05-04 07:52:12.63446+00'), 
('res-8f2495b7-042a-4148-8730-3dc297db4b5b', '2026-05-04 08:00:08.337615+00');
