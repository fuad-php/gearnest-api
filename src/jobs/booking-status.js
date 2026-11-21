import cron from "node-cron";
import { getDB } from "../config/db.js";
import { completeBooking } from "../utils/completion.js";

/**
 * Completes every booking whose rental end date has passed.
 * Shared by the hourly cron job and the startup sweep.
 */
export async function runBookingStatusSweep() {
  const db = getDB();
  const now = new Date();

  const due = await db
    .collection("bookings")
    .find({
      bookingStatus: { $in: ["confirmed", "active"] },
      rentalEndDate: { $lt: now },
    })
    .toArray();

  let completed = 0;

  for (const booking of due) {
    const result = await completeBooking(db, booking, { reason: "rental-end" });
    if (result.completed) completed += 1;
  }

  if (due.length) {
    console.log(
      `[cron] booking sweep: ${due.length} due, ${completed} completed`,
    );
  }

  return { checked: due.length, completed };
}

export function startBookingStatusJob() {
  // Hourly at minute 0. Runs in UTC so behaviour is identical on every host.
  const task = cron.schedule(
    "0 * * * *",
    () => {
      runBookingStatusSweep().catch((error) => {
        console.error("[cron] booking sweep failed:", error.message);
      });
    },
    { timezone: "UTC" },
  );

  // Also sweep once shortly after boot so a restarted server catches up.
  const timer = setTimeout(() => {
    runBookingStatusSweep().catch((error) => {
      console.error("[cron] startup sweep failed:", error.message);
    });
  }, 3_000);
  timer.unref?.();

  console.log("[cron] booking status sweep scheduled hourly");
  return task;
}
