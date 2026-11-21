import { completionEmails } from "./booking-emails.js";
import { sendMail } from "./mailer.js";

/**
 * Sends the completion emails once per booking and records that they went out.
 * Safe to call repeatedly — the `completionNotifiedAt` flag prevents duplicates.
 */
export async function notifyCompletion(db, booking) {
  if (booking.completionNotifiedAt) {
    return { sent: 0, skipped: true };
  }

  const owner = await db
    .collection("user")
    .findOne({ _id: booking.ownerId }, { projection: { email: 1 } });

  const emails = completionEmails(booking, owner?.email);
  const results = await Promise.all(emails.map((email) => sendMail(email)));

  await db
    .collection("bookings")
    .updateOne(
      { _id: booking._id },
      { $set: { completionNotifiedAt: new Date() } },
    );

  return {
    sent: results.filter((result) => result.sent).length,
    skipped: results.every((result) => result.skipped),
  };
}

/**
 * Atomically moves a confirmed or active booking to completed, then notifies
 * the renter and the owner. Returns `completed: false` if another process
 * (owner click or cron sweep) already changed the status.
 */
export async function completeBooking(db, booking, { reason = "manual" } = {}) {
  const now = new Date();

  const updated = await db.collection("bookings").findOneAndUpdate(
    { _id: booking._id, bookingStatus: { $in: ["confirmed", "active"] } },
    {
      $set: {
        bookingStatus: "completed",
        updatedAt: now,
        completedAt: now,
        completionReason: reason,
      },
    },
    { returnDocument: "after" },
  );

  if (!updated) {
    return { booking, completed: false, notified: false };
  }

  const notification = await notifyCompletion(db, updated);

  return {
    booking: updated,
    completed: true,
    notified: notification.sent > 0,
  };
}
