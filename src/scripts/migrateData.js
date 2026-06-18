// ─── Data Migration: Postgres → MongoDB ─────────────────────────────
// Reads from the existing Supabase Postgres database and inserts into
// MongoDB via Mongoose. Builds a UUID→ObjectId mapping so foreign key
// relationships are correctly translated.
//
// Usage:  node src/scripts/migrateData.js
// Env:    PG_CONNECTION_STRING, MONGO_URI  (from .env)

const { Client } = require('pg');
const mongoose = require('mongoose');
const path = require('path');

// Load env
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Models
const Category = require('../models/Category');
const MenuItem = require('../models/MenuItem');
const MenuItemExtra = require('../models/MenuItemExtra');
const Table = require('../models/Table');
const Order = require('../models/Order');
const Reservation = require('../models/Reservation');
const DeliveryOrder = require('../models/DeliveryOrder');
const AppSetting = require('../models/AppSetting');
const PushSubscription = require('../models/PushSubscription');
const PushLog = require('../models/PushLog');

// UUID → ObjectId map (built during migration, keyed by original UUID)
const idMap = {};

const log = (msg) => console.log(`[migrate] ${msg}`);
const warn = (msg) => console.warn(`[migrate] ⚠️  ${msg}`);

/**
 * Store a UUID → ObjectId mapping.
 */
const mapId = (uuid, objectId) => {
  idMap[uuid] = objectId;
};

/**
 * Look up an ObjectId from a UUID. Returns null if not found.
 */
const resolveId = (uuid) => {
  if (!uuid) return null;
  return idMap[uuid] || null;
};

// ─────────────────────────────────────────────────────────────────────
async function main() {
  const PG_URI = process.env.PG_CONNECTION_STRING;
  const MONGO_URI = process.env.MONGO_URI;

  if (!PG_URI) {
    console.error('❌  PG_CONNECTION_STRING is not set in .env');
    process.exit(1);
  }
  if (!MONGO_URI) {
    console.error('❌  MONGO_URI is not set in .env');
    process.exit(1);
  }

  // Connect Postgres
  const pg = new Client({ connectionString: PG_URI });
  await pg.connect();
  log('Connected to Postgres');

  // Connect Mongo
  await mongoose.connect(MONGO_URI);
  log('Connected to MongoDB');

  try {
    // ── 1. Categories ──────────────────────────────────────────────
    log('Migrating categories...');
    const { rows: cats } = await pg.query('SELECT * FROM public.categories ORDER BY sort_order');
    for (const row of cats) {
      try {
        const doc = await Category.findOneAndUpdate(
          { name: row.name },
          {
            name: row.name,
            sortOrder: row.sort_order || 0,
            isHidden: row.is_hidden || false,
          },
          { upsert: true, new: true }
        );
        mapId(row.id, doc._id);
      } catch (err) {
        warn(`Category "${row.name}": ${err.message}`);
      }
    }
    log(`  ✓ ${cats.length} categories`);

    // ── 2. Menu Items ──────────────────────────────────────────────
    log('Migrating menu items...');
    const { rows: items } = await pg.query('SELECT * FROM public.menu_items ORDER BY sort_order');
    for (const row of items) {
      try {
        // Parse JSONB arrays
        let variants = [];
        if (row.variants) {
          variants = (typeof row.variants === 'string' ? JSON.parse(row.variants) : row.variants)
            .filter((v) => v && v.name);
        }
        let options = [];
        if (row.options) {
          options = (typeof row.options === 'string' ? JSON.parse(row.options) : row.options)
            .filter((o) => o && o.trim());
        }

        const doc = await MenuItem.findOneAndUpdate(
          { name: row.name, price: parseFloat(row.price) },
          {
            name: row.name,
            description: row.description || '',
            price: parseFloat(row.price),
            categoryId: resolveId(row.category_id),
            imageUrl: row.image_url || '',
            isAvailable: row.is_available !== false,
            isFeatured: row.is_featured || false,
            sortOrder: row.sort_order || 0,
            variants,
            options,
          },
          { upsert: true, new: true }
        );
        mapId(row.id, doc._id);
      } catch (err) {
        warn(`MenuItem "${row.name}": ${err.message}`);
      }
    }
    log(`  ✓ ${items.length} menu items`);

    // ── 3. Menu Item Extras ────────────────────────────────────────
    log('Migrating menu item extras...');
    const { rows: extras } = await pg.query('SELECT * FROM public.menu_item_extras');
    for (const row of extras) {
      try {
        const doc = await MenuItemExtra.findOneAndUpdate(
          { name: row.name, categoryId: resolveId(row.category_id) },
          {
            categoryId: resolveId(row.category_id),
            name: row.name,
            price: parseFloat(row.price),
          },
          { upsert: true, new: true }
        );
        mapId(row.id, doc._id);
      } catch (err) {
        warn(`Extra "${row.name}": ${err.message}`);
      }
    }
    log(`  ✓ ${extras.length} extras`);

    // ── 4. Tables ──────────────────────────────────────────────────
    log('Migrating tables...');
    const { rows: tables } = await pg.query('SELECT * FROM public.tables ORDER BY number');
    for (const row of tables) {
      try {
        const doc = await Table.findOneAndUpdate(
          { number: row.number },
          {
            number: row.number,
            qrToken: row.qr_token,
            isActive: row.is_active !== false,
            minSeats: row.min_seats || 2,
            maxSeats: row.max_seats || 4,
            xPosition: row.x_position || 50,
            yPosition: row.y_position || 50,
            zone: row.zone || 'interior',
            width: row.width || 6,
            height: row.height || 6,
          },
          { upsert: true, new: true }
        );
        mapId(row.id, doc._id);
      } catch (err) {
        warn(`Table ${row.number}: ${err.message}`);
      }
    }
    log(`  ✓ ${tables.length} tables`);

    // ── 5. Orders + Order Items (embedded) ─────────────────────────
    log('Migrating orders...');
    const { rows: orders } = await pg.query('SELECT * FROM public.orders ORDER BY created_at');
    const { rows: orderItems } = await pg.query('SELECT * FROM public.order_items');

    // Group order items by order_id
    const itemsByOrder = {};
    for (const oi of orderItems) {
      if (!itemsByOrder[oi.order_id]) itemsByOrder[oi.order_id] = [];
      let selectedExtras = [];
      if (oi.selected_extras) {
        selectedExtras = (typeof oi.selected_extras === 'string'
          ? JSON.parse(oi.selected_extras)
          : oi.selected_extras
        ).filter((e) => e && e.name);
      }
      itemsByOrder[oi.order_id].push({
        menuItemId: resolveId(oi.menu_item_id),
        menuItemName: oi.menu_item_name || 'Unknown',
        quantity: oi.quantity || 1,
        unitPrice: parseFloat(oi.unit_price),
        selectedExtras,
      });
    }

    for (const row of orders) {
      try {
        const doc = await Order.findOneAndUpdate(
          { trackingCode: row.tracking_code || `PG-${row.id.slice(0, 8)}` },
          {
            tableId: resolveId(row.table_id),
            tableNumber: row.table_number,
            status: row.status || 'pending',
            total: parseFloat(row.total),
            notes: row.notes || '',
            trackingCode: row.tracking_code || `PG-${row.id.slice(0, 8)}`,
            items: itemsByOrder[row.id] || [],
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          },
          { upsert: true, new: true, timestamps: false }
        );
        mapId(row.id, doc._id);
      } catch (err) {
        warn(`Order ${row.id}: ${err.message}`);
      }
    }
    log(`  ✓ ${orders.length} orders (${orderItems.length} line items)`);

    // ── 6. Reservations ────────────────────────────────────────────
    log('Migrating reservations...');
    const { rows: reservations } = await pg.query('SELECT * FROM public.reservations ORDER BY created_at');
    for (const row of reservations) {
      try {
        const doc = await Reservation.findOneAndUpdate(
          { customerPhone: row.customer_phone, reservationDate: row.reservation_date },
          {
            tableId: resolveId(row.table_id),
            customerName: row.customer_name,
            customerPhone: row.customer_phone,
            numGuests: row.num_guests,
            reservationType: row.reservation_type || 'normal',
            reservationDate: row.reservation_date,
            status: row.status || 'pending',
            notes: row.notes || '',
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          },
          { upsert: true, new: true, timestamps: false }
        );
        mapId(row.id, doc._id);
      } catch (err) {
        warn(`Reservation ${row.id}: ${err.message}`);
      }
    }
    log(`  ✓ ${reservations.length} reservations`);

    // ── 7. Delivery Orders ─────────────────────────────────────────
    log('Migrating delivery orders...');
    const { rows: deliveries } = await pg.query('SELECT * FROM public.delivery_orders ORDER BY created_at');
    for (const row of deliveries) {
      try {
        let items = [];
        if (row.items) {
          const parsed = typeof row.items === 'string' ? JSON.parse(row.items) : row.items;
          items = parsed.map((i) => ({
            menuItemId: resolveId(i.menuItemId),
            menuItemName: i.menuItemName || 'Unknown',
            quantity: i.quantity || 1,
            unitPrice: parseFloat(i.unitPrice),
            optionName: i.optionName || '',
            variantName: i.variantName || '',
          }));
        }

        const doc = await DeliveryOrder.findOneAndUpdate(
          { trackingCode: row.tracking_code || `PG-${row.id.slice(0, 8)}` },
          {
            customerName: row.customer_name,
            customerPhone: row.customer_phone,
            customerAddress: row.customer_address,
            items,
            subtotal: parseFloat(row.subtotal),
            deliveryFee: parseFloat(row.delivery_fee),
            total: parseFloat(row.total),
            notes: row.notes || '',
            status: row.status || 'pending',
            trackingCode: row.tracking_code || `PG-${row.id.slice(0, 8)}`,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          },
          { upsert: true, new: true, timestamps: false }
        );
        mapId(row.id, doc._id);
      } catch (err) {
        warn(`Delivery ${row.id}: ${err.message}`);
      }
    }
    log(`  ✓ ${deliveries.length} delivery orders`);

    // ── 8. App Settings ────────────────────────────────────────────
    log('Migrating app settings...');
    const { rows: settings } = await pg.query('SELECT * FROM public.app_settings');
    for (const row of settings) {
      try {
        let value = row.value;
        // Try to parse stringified JSON inside JSONB
        if (typeof value === 'string') {
          try { value = JSON.parse(value); } catch { /* keep as string */ }
        }
        await AppSetting.findOneAndUpdate(
          { key: row.key },
          { key: row.key, value },
          { upsert: true, new: true }
        );
      } catch (err) {
        warn(`Setting "${row.key}": ${err.message}`);
      }
    }
    log(`  ✓ ${settings.length} settings`);

    // ── 9. Push Logs ───────────────────────────────────────────────
    log('Migrating push logs...');
    const { rows: logs } = await pg.query('SELECT * FROM public.push_logs');
    for (const row of logs) {
      try {
        await PushLog.findOneAndUpdate(
          { tag: row.tag },
          { tag: row.tag },
          { upsert: true, new: true }
        );
      } catch (err) {
        warn(`PushLog "${row.tag}": ${err.message}`);
      }
    }
    log(`  ✓ ${logs.length} push logs`);

    // ── 10. Push Subscriptions ─────────────────────────────────────
    log('Migrating push subscriptions...');
    const { rows: subs } = await pg.query('SELECT * FROM public.push_subscriptions');
    for (const row of subs) {
      try {
        await PushSubscription.findOneAndUpdate(
          { endpoint: row.endpoint },
          {
            endpoint: row.endpoint,
            p256dh: row.p256dh,
            authKey: row.auth_key,
            // userId mapping skipped — Supabase auth.users UUIDs won't match new Mongo User _ids
            // Users will re-subscribe after migration
          },
          { upsert: true, new: true }
        );
      } catch (err) {
        warn(`PushSub: ${err.message}`);
      }
    }
    log(`  ✓ ${subs.length} push subscriptions`);

    log('');
    log('═══════════════════════════════════════════');
    log('  Migration complete! ✅');
    log(`  ID mappings created: ${Object.keys(idMap).length}`);
    log('═══════════════════════════════════════════');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pg.end();
    await mongoose.disconnect();
  }
}

main();
