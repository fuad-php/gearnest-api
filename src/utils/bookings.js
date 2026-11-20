/**
 * Turns a paid checkout draft into a confirmed booking.
 * Idempotent: the unique index on payments.stripeSessionId prevents duplicates.
 */
export async function confirmBookingDraft(db, sessionId) {
  const draft = await db
    .collection("bookingDrafts")
    .findOne({ stripeSessionId: sessionId });

  if (!draft) {
    return { error: "Draft not found or expired" };
  }

  const existing = await db
    .collection("bookings")
    .findOne({ stripeSessionId: sessionId });

  if (existing) {
    return { booking: existing, duplicate: true };
  }

  try {
    await db.collection("payments").insertOne({
      bookingId: null,
      customerId: draft.customerId,
      ownerId: draft.ownerId,
      amountCents: draft.amountCents,
      currency: "usd",
      stripeSessionId: sessionId,
      provider: draft.provider,
      status: "paid",
      createdAt: new Date(),
    });
  } catch (error) {
    if (error?.code === 11000) {
      const booking = await db
        .collection("bookings")
        .findOne({ stripeSessionId: sessionId });
      if (booking) return { booking, duplicate: true };
    }
    throw error;
  }

  const now = new Date();
  const booking = {
    equipmentId: draft.equipmentId,
    equipmentName: draft.equipmentName,
    equipmentImage: draft.equipmentImage,
    customerId: draft.customerId,
    customerName: draft.customerName,
    customerEmail: draft.customerEmail,
    ownerId: draft.ownerId,
    ownerName: draft.ownerName,
    rentalStartDate: draft.rentalStartDate,
    rentalEndDate: draft.rentalEndDate,
    quantity: draft.quantity,
    days: draft.days,
    totalAmountCents: draft.amountCents,
    paymentStatus: "paid",
    bookingStatus: "confirmed",
    contactNumber: draft.contactNumber,
    deliveryAddress: draft.deliveryAddress,
    notes: draft.notes ?? "",
    stripeSessionId: sessionId,
    provider: draft.provider,
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection("bookings").insertOne(booking);

  await db
    .collection("payments")
    .updateOne(
      { stripeSessionId: sessionId },
      { $set: { bookingId: result.insertedId } },
    );

  await db.collection("bookingDrafts").deleteOne({ _id: draft._id });

  return { booking: { ...booking, _id: result.insertedId }, duplicate: false };
}
