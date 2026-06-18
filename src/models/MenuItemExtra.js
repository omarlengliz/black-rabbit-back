// ─── MenuItemExtra Model ────────────────────────────────────────────
// Maps: public.menu_item_extras

const mongoose = require('mongoose');

const menuItemExtraSchema = new mongoose.Schema(
  {
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    name: {
      type: String,
      required: [true, 'Extra name is required'],
      trim: true,
    },
    price: {
      type: Number,
      required: [true, 'Extra price is required'],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MenuItemExtra', menuItemExtraSchema);
