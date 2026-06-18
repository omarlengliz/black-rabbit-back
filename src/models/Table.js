// ─── Table Model ────────────────────────────────────────────────────
// Maps: public.tables (restaurant tables, not DB tables)

const mongoose = require('mongoose');
const crypto = require('crypto');

const tableSchema = new mongoose.Schema(
  {
    number: {
      type: Number,
      required: [true, 'Table number is required'],
      unique: true,
    },
    qrToken: {
      type: String,
      required: true,
      unique: true,
      default: () => crypto.randomBytes(32).toString('hex'),
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    minSeats: {
      type: Number,
      default: 2,
    },
    maxSeats: {
      type: Number,
      default: 4,
    },
    xPosition: {
      type: Number,
      default: 50,
    },
    yPosition: {
      type: Number,
      default: 50,
    },
    zone: {
      type: String,
      default: 'interior',
    },
    width: {
      type: Number,
      default: 6,
    },
    height: {
      type: Number,
      default: 6,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Table', tableSchema);
