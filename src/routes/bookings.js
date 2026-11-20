import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { verifyRenter } from "../middleware/auth.js";
import { serialize } from "../utils/serialize.js";

const router = Router();

router.get("/my", verifyRenter, async (req, res) => {
  const filter = { customerId: new ObjectId(req.user.id) };

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
