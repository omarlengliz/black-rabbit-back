// ─── Reservation Controller ─────────────────────────────────────────
const Reservation = require('../models/Reservation');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const sse = require('../sse/sseManager');

/** GET /api/reservations — staff only */
const list = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.date) {
    const start = new Date(req.query.date);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    filter.reservationDate = { $gte: start, $lt: end };
  }
  const reservations = await Reservation.find(filter)
    .populate('tableId', 'number')
    .sort({ reservationDate: 1 });
  return success(res, reservations);
});

/** GET /api/reservations/:id — staff only */
const getById = asyncHandler(async (req, res) => {
  const reservation = await Reservation.findById(req.params.id).populate('tableId', 'number');
  if (!reservation) return error(res, 'Reservation not found', 404);
  return success(res, reservation);
});

/** POST /api/reservations — public */
const create = asyncHandler(async (req, res) => {
  const { customerName, customerPhone, numGuests, reservationDate } = req.body;
  if (!customerName || !customerPhone || !numGuests || !reservationDate) {
    return error(res, 'customerName, customerPhone, numGuests, and reservationDate are required', 400);
  }
  const reservation = await Reservation.create(req.body);

  // SSE broadcast (replaces Supabase Realtime on reservations table)
  sse.broadcast('reservation:new', reservation);

  return success(res, reservation, 201);
});

/** PATCH /api/reservations/:id/status — staff only */
const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const valid = ['pending', 'confirmed', 'checked_in', 'expired', 'cancelled'];
  if (!valid.includes(status)) {
    return error(res, `Status must be one of: ${valid.join(', ')}`, 400);
  }
  const reservation = await Reservation.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true, runValidators: true }
  );
  if (!reservation) return error(res, 'Reservation not found', 404);

  sse.broadcast('reservation:updated', { reservationId: reservation._id, status });

  return success(res, reservation);
});

/** PUT /api/reservations/:id — staff only */
const update = asyncHandler(async (req, res) => {
  const reservation = await Reservation.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!reservation) return error(res, 'Reservation not found', 404);
  return success(res, reservation);
});

/** DELETE /api/reservations/:id — staff only */
const remove = asyncHandler(async (req, res) => {
  const reservation = await Reservation.findByIdAndDelete(req.params.id);
  if (!reservation) return error(res, 'Reservation not found', 404);
  return success(res, { message: 'Reservation deleted' });
});

module.exports = { list, getById, create, updateStatus, update, remove };
