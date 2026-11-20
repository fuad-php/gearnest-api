const DAY_MS = 1000 * 60 * 60 * 24;

export function rentalDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diff = Math.ceil((end.getTime() - start.getTime()) / DAY_MS);
  return Math.max(1, diff);
}

export function durationUnits(days, rentalType) {
  if (rentalType === "weekly") return Math.max(1, Math.ceil(days / 7));
  if (rentalType === "monthly") return Math.max(1, Math.ceil(days / 30));
  return days;
}

export function calculateTotal({ price, rentalType, days, quantity }) {
  const units = durationUnits(days, rentalType);
  const amount = Number(price) * units * Number(quantity);
  return {
    units,
    days,
    amountCents: Math.round(amount * 100),
  };
}

export function parseDateRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: "Rental dates must be valid dates" };
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (start < today) return { error: "Rental start date cannot be in the past" };
  if (end < start) return { error: "Rental end date must be after the start date" };

  return { start, end };
}
