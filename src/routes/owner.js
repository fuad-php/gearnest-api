import { Router } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDB } from "../config/db.js";
import { verifyOwner } from "../middleware/auth.js";
import { completeBooking } from "../utils/completion.js";
import { serialize } from "../utils/serialize.js";
import { badRequest, validate } from "../utils/validate.js";

const router = Router();

router.use(verifyOwner);

const statusSchema = z.object({
  status: z.enum(["active", "completed", "cancelled"]),
});

router.get("/equipment", async (req, res) => {
  const filter = { ownerId: new ObjectId(req.user.id) };

  if (req.query.status && req.query.status !== "all") {
    filter.status = req.query.status;
  }

  const items = await getDB()
    .collection("equipment")
    .find(filter)
    .sort({ createdAt: -1 })
    .toArray();

  res.json({ data: serialize(items) });
});

router.get("/equipment/:id", async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: "Equipment not found" });
  }

  const item = await getDB()
    .collection("equipment")
    .findOne({ _id: new ObjectId(req.params.id) });

  if (!item) {
    return res.status(404).json({ message: "Equipment not found" });
  }

  if (String(item.ownerId) !== req.user.id) {
    return res.status(403).json({ message: "This listing is not yours" });
  }

  res.json({ data: serialize(item) });
});

router.get("/bookings", async (req, res) => {
  const filter = { ownerId: new ObjectId(req.user.id) };

  if (req.query.status && req.query.status !== "all") {
    filter.bookingStatus = req.query.status;
  }

  const bookings = await getDB()
    .collection("bookings")
    .find(filter)
    .sort({ createdAt: -1 })
    .toArray();

  res.json({ data: serialize(bookings) });
});

router.patch("/bookings/:id/status", async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: "Booking not found" });
  }

  const parsed = validate(statusSchema, req.body);
  if (!parsed.ok) return badRequest(res, parsed.errors);

  const db = getDB();
  const booking = await db
    .collection("bookings")
    .findOne({ _id: new ObjectId(req.params.id) });

  if (!booking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  if (String(booking.ownerId) !== req.user.id) {
    return res.status(403).json({ message: "This booking is not on your equipment" });
  }

  const next = parsed.data.status;
  const allowed = {
    confirmed: ["active", "cancelled"],
    active: ["completed"],
    completed: [],
    cancelled: [],
  };

  if (!allowed[booking.bookingStatus]?.includes(next)) {
    return res.status(400).json({
      message: `Cannot move a ${booking.bookingStatus} booking to ${next}`,
    });
  }

  if (next === "completed") {
    const result = await completeBooking(db, booking, { reason: "owner" });
    return res.json({ data: serialize(result.booking) });
  }

  const updates = { bookingStatus: next, updatedAt: new Date() };
  if (next === "cancelled") updates.paymentStatus = "refunded";

  await db
    .collection("bookings")
    .updateOne({ _id: booking._id }, { $set: updates });

  res.json({ data: serialize({ ...booking, ...updates }) });
});

function monthKeys(months = 6) {
  const keys = [];
  const now = new Date();

  for (let index = months - 1; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    keys.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }

  return keys;
}

router.get("/stats", async (req, res) => {
  const db = getDB();
  const ownerId = new ObjectId(req.user.id);

  const [totalEquipment, approvedEquipment, totalBookings, completedRentals, earnings] =
    await Promise.all([
      db.collection("equipment").countDocuments({ ownerId }),
      db
        .collection("equipment")
        .countDocuments({ ownerId, status: "approved" }),
      db.collection("bookings").countDocuments({ ownerId }),
      db
        .collection("bookings")
        .countDocuments({ ownerId, bookingStatus: "completed" }),
      db
        .collection("bookings")
        .aggregate([
          {
            $match: {
              ownerId,
              paymentStatus: "paid",
              bookingStatus: { $in: ["confirmed", "active", "completed"] },
            },
          },
          { $group: { _id: null, total: { $sum: "$totalAmountCents" } } },
        ])
        .toArray(),
    ]);

  const start = new Date();
  start.setMonth(start.getMonth() - 5);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const monthly = await db
    .collection("bookings")
    .aggregate([
      {
        $match: {
          ownerId,
          createdAt: { $gte: start },
          paymentStatus: "paid",
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          bookings: { $sum: 1 },
          earningsCents: { $sum: "$totalAmountCents" },
        },
      },
    ])
    .toArray();

  const monthlyMap = new Map(monthly.map((entry) => [entry._id, entry]));

  res.json({
    data: {
      totalEquipment,
      approvedEquipment,
      totalBookings,
      completedRentals,
      totalEarningsCents: earnings[0]?.total ?? 0,
      monthly: monthKeys().map((key) => ({
        month: key,
        bookings: monthlyMap.get(key)?.bookings ?? 0,
        earningsCents: monthlyMap.get(key)?.earningsCents ?? 0,
      })),
    },
  });
});

export default router;
