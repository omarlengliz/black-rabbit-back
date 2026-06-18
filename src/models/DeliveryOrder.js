// ─── DeliveryOrder Model ────────────────────────────────────────────
// Maps: public.delivery_orders
// Items embedded as subdocs (same pattern as dine-in orders).

const mongoose = require('mongoose');

const deliveryItemSchema = new mongoose.Schema(
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
    unitPrice: {
      type: Number,
      required: true,
    },
    optionName: {
      type: String,
      default: '',
    },
    variantName: {
      type: String,
      default: '',
    },
  },
  { _id: false }
);

const deliveryOrderSchema = new mongoose.Schema(
  {
    customerName: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
    },
    customerPhone: {
      type: String,
      required: [true, 'Customer phone is required'],
      trim: true,
    },
    customerAddress: {
      type: String,
      required: [true, 'Customer address is required'],
    },
    items: {
      type: [deliveryItemSchema],
      default: [],
    },
    subtotal: {
      type: Number,
      required: true,
    },
    deliveryFee: {
      type: Number,
      required: true,
      default: 3,
    },
    total: {
      type: Number,
      required: true,
    },
    notes: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'preparing', 'delivering', 'delivered', 'cancelled'],
      default: 'pending',
    },
    trackingCode: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

deliveryOrderSchema.index({ status: 1 });
deliveryOrderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('DeliveryOrder', deliveryOrderSchema);
