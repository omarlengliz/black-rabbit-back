// ─── Order Model ────────────────────────────────────────────────────
// Maps: public.orders + public.order_items (items embedded as subdocs).
// Embedding order_items avoids a separate collection and keeps reads
// atomic — each order is self-contained with its line items.

const mongoose = require('mongoose');

const selectedExtraSchema = new mongoose.Schema(
  {
    name: { type: String },
    price: { type: Number },
  },
  { _id: false }
);

const orderItemSchema = new mongoose.Schema(
  {
    menuItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MenuItem',
      default: null,
    },
    menuItemName: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      default: 1,
    },
    variantName: {
      type: String,
      default: null,
    },
    optionName: {
      type: String,
      default: null,
    },
    unitPrice: {
      type: Number,
      required: true,
    },
    selectedExtras: {
      type: [selectedExtraSchema],
      default: [],
    },
  },
  { _id: true }
);

const orderSchema = new mongoose.Schema(
  {
    tableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Table',
      default: null,
    },
    tableNumber: {
      type: Number,
      required: [true, 'Table number is required'],
    },
    status: {
      type: String,
      enum: ['pending', 'preparing', 'completed', 'cancelled'],
      default: 'pending',
    },
    total: {
      type: Number,
      required: [true, 'Order total is required'],
    },
    notes: {
      type: String,
      default: '',
    },
    trackingCode: {
      type: String,
      default: '',
    },
    items: {
      type: [orderItemSchema],
      default: [],
    },
  },
  { timestamps: true }
);

// Indexes mirroring Postgres
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ tableId: 1 });

module.exports = mongoose.model('Order', orderSchema);
