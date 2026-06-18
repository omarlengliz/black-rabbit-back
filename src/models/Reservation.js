// ─── Reservation Model ──────────────────────────────────────────────
// Maps: public.reservations

const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema(
  {
    tableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Table',
      default: null,
    },
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
    numGuests: {
      type: Number,
      required: [true, 'Number of guests is required'],
    },
    reservationType: {
      type: String,
      enum: ['normal', 'anniversaire'],
      default: 'normal',
    },
    reservationDate: {
      type: Date,
      required: [true, 'Reservation date is required'],
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'checked_in', 'expired', 'cancelled'],
      default: 'pending',
    },
    notes: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

reservationSchema.index({ status: 1 });
reservationSchema.index({ reservationDate: 1 });
reservationSchema.index({ tableId: 1 });

module.exports = mongoose.model('Reservation', reservationSchema);
