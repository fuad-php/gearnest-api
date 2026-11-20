import { ObjectId } from "mongodb";

/**
 * Sums the quantity of active bookings that overlap a date range.
 * Returns the number of units already committed for those dates.
 */
export async function bookedQuantity(db, equipmentId, start, end, excludeBookingId) {
  const match = {
    equipmentId: new ObjectId(equipmentId),
    bookingStatus: { $in: ["confirmed", "active"] },
    rentalStartDate: { $lte: end },
    rentalEndDate: { $gte: start },
  };

  if (excludeBookingId) {
    match._id = { $ne: new ObjectId(excludeBookingId) };
  }

  const [result] = await db
    .collection("bookings")
    .aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: "$quantity" } } },
    ])
    .toArray();

  return result?.total ?? 0;
}

export async function assertAvailability(db, equipment, start, end, quantity) {
  const committed = await bookedQuantity(db, equipment._id, start, end);
  const remaining = Number(equipment.quantity) - committed;

  if (quantity > remaining) {
    return {
      ok: false,
      remaining,
      message: `Only ${Math.max(0, remaining)} unit(s) available for these dates`,
    };
  }

  return { ok: true, remaining };
}
