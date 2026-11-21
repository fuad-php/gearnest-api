import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { verifyRenter } from "../middleware/auth.js";
import { paginate, parsePagination } from "../utils/query.js";
import { serialize } from "../utils/serialize.js";

const router = Router();

const BOOKING_STATUSES = new Set([
  "confirmed",
  "active",
  "completed",
  "cancelled",
]);

router.get("/my", verifyRenter, async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, {
    defaultLimit: 6,
    maxLimit: 50,
  });
  const customerId = new ObjectId(req.user.id);
  const filter = { customerId };

  if (BOOKING_STATUSES.has(req.query.status)) {
    filter.bookingStatus = req.query.status;
  }

  const bookings = getDB().collection("bookings");

  const [{ items, total, pages }, grouped] = await Promise.all([
    paginate(bookings, filter, { page, limit, skip }),
    bookings
      .aggregate([
        { $match: { customerId } },
        { $group: { _id: "$bookingStatus", count: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  // Counts power the status tabs, which must stay stable while a tab is active.
  const counts = { all: 0, confirmed: 0, active: 0, completed: 0, cancelled: 0 };

  for (const row of grouped) {
    if (row._id in counts) counts[row._id] = row.count;
    counts.all += row.count;
  }

  res.json({ data: serialize(items), page, limit, total, pages, counts });
});

router.get("/:id", verifyRenter, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: "Booking not found" });
  }

  const booking = await getDB()
    .collection("bookings")
    .findOne({ _id: new ObjectId(req.params.id) });

  if (!booking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  if (String(booking.customerId) !== req.user.id) {
    return res.status(403).json({ message: "This booking is not yours" });
  }

  res.json({ data: serialize(booking) });
});

router.patch("/:id/cancel", verifyRenter, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: "Booking not found" });
  }

  const db = getDB();
  const booking = await db
    .collection("bookings")
    .findOne({ _id: new ObjectId(req.params.id) });

  if (!booking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  if (String(booking.customerId) !== req.user.id) {
    return res.status(403).json({ message: "This booking is not yours" });
  }

  if (booking.bookingStatus === "cancelled") {
    return res.json({ data: serialize(booking) });
  }

  if (booking.bookingStatus === "completed") {
    return res
      .status(400)
      .json({ message: "Completed rentals cannot be cancelled" });
  }

  if (new Date(booking.rentalStartDate) <= new Date()) {
    return res
      .status(400)
      .json({ message: "Rentals that have started cannot be cancelled" });
  }

  const updated = {
    bookingStatus: "cancelled",
    paymentStatus: "refunded",
    updatedAt: new Date(),
  };

  await db
    .collection("bookings")
    .updateOne({ _id: booking._id }, { $set: updated });

  res.json({ data: serialize({ ...booking, ...updated }) });
});

export default router;
