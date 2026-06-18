// ─── MenuItem Model ─────────────────────────────────────────────────
// Maps: public.menu_items
// Variants and options stored as embedded arrays (JSONB → subdocs/strings).

const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
  },
  { _id: false }
);

const menuItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Menu item name is required'],
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    imageUrl: {
      type: String,
      default: '',
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    variants: {
      type: [variantSchema],
      default: [],
    },
    options: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

// Indexes mirroring Postgres performance indexes
menuItemSchema.index({ categoryId: 1 });
menuItemSchema.index({ isAvailable: 1, categoryId: 1 });
menuItemSchema.index({ isFeatured: 1 });

module.exports = mongoose.model('MenuItem', menuItemSchema);
