import { randomUUID } from "node:crypto";
import { Router } from "express";
import { ObjectId } from "mongodb";
import Stripe from "stripe";
import { z } from "zod";
import { getDB } from "../config/db.js";
import { verifyRenter } from "../middleware/auth.js";
import { assertAvailability } from "../utils/availability.js";
import { confirmBookingDraft } from "../utils/bookings.js";
import { calculateTotal, parseDateRange } from "../utils/pricing.js";
import { serialize } from "../utils/serialize.js";
import { badRequest, validate } from "../utils/validate.js";

const router = Router();

const checkoutSchema = z.object({
  equipmentId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid equipment id"),
  startDate: z.string().min(8),
  endDate: z.string().min(8),
  quantity: z.coerce.number().int().min(1).max(100),
  contactNumber: z.string().trim().min(6).max(40),
  deliveryAddress: z.string().trim().min(8).max(240),
  notes: z.string().trim().max(1000).optional().default(""),
});

const confirmSchema = z.object({
  sessionId: z.string().trim().min(3).max(255),
});

function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

router.post("/checkout", verifyRenter, async (req, res) => {
  const parsed = validate(checkoutSchema, req.body);
  if (!parsed.ok) return badRequest(res, parsed.errors);

  const input = parsed.data;
  const range = parseDateRange(input.startDate, input.endDate);
  if (range.error) return res.status(400).json({ message: range.error });

  const db = getDB();
  const equipment = await db
    .collection("equipment")
    .findOne({ _id: new ObjectId(input.equipmentId), status: "approved" });

  if (!equipment) {
    return res.status(404).json({ message: "Equipment not found" });
  }

  if (String(equipment.ownerId) === req.user.id) {
    return res
      .status(400)
      .json({ message: "You cannot rent your own equipment" });
  }

  if (input.quantity > Number(equipment.quantity)) {
    return res.status(400).json({
      message: `This listing has ${equipment.quantity} unit(s) in total`,
    });
  }

  const availability = await assertAvailability(
    db,
    equipment,
    range.start,
    range.end,
    input.quantity,
  );

  if (!availability.ok) {
    return res.status(409).json({ message: availability.message });
  }

  const pricing = calculateTotal({
    price: equipment.price,
    rentalType: equipment.rentalType,
    days: Math.max(
      1,
      Math.ceil((range.end.getTime() - range.start.getTime()) / 86_400_000),
    ),
    quantity: input.quantity,
  });

  const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
  const stripe = stripeClient();
  let sessionId;
  let checkoutUrl;
  let provider = "stripe";

  if (stripe) {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: req.user.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: pricing.amountCents,
            product_data: {
              name: `${equipment.name} — ${pricing.units} × ${equipment.rentalType}`,
              description: `${pricing.days} day(s), ${input.quantity} unit(s)`,
            },
          },
        },
      ],
      metadata: {
        equipmentId: input.equipmentId,
        customerId: req.user.id,
        startDate: range.start.toISOString(),
        endDate: range.end.toISOString(),
        quantity: String(input.quantity),
      },
      success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/equipment/${input.equipmentId}?checkout=cancelled`,
    });

    sessionId = session.id;
    checkoutUrl = session.url;
  } else {
    provider = "demo";
    sessionId = `demo_${randomUUID()}`;
    checkoutUrl = `${clientUrl}/payment/success?session_id=${sessionId}&demo=1`;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);

  await db.collection("bookingDrafts").insertOne({
    stripeSessionId: sessionId,
    provider,
    equipmentId: equipment._id,
    equipmentName: equipment.name,
    equipmentImage: equipment.image,
    ownerId: equipment.ownerId,
    ownerName: equipment.ownerName ?? "",
    customerId: new ObjectId(req.user.id),
    customerName: req.user.name,
    customerEmail: req.user.email,
    rentalStartDate: range.start,
    rentalEndDate: range.end,
    quantity: input.quantity,
    days: pricing.days,
    units: pricing.units,
    amountCents: pricing.amountCents,
    contactNumber: input.contactNumber,
    deliveryAddress: input.deliveryAddress,
    notes: input.notes,
    createdAt: now,
    expiresAt,
  });

  res.status(201).json({
    data: {
      url: checkoutUrl,
      sessionId,
      provider,
      amountCents: pricing.amountCents,
      days: pricing.days,
      units: pricing.units,
      remaining: availability.remaining,
    },
  });
});

router.post("/confirm", verifyRenter, async (req, res) => {
  const parsed = validate(confirmSchema, req.body);
  if (!parsed.ok) return badRequest(res, parsed.errors);

  const { sessionId } = parsed.data;
  const db = getDB();

  const draft = await db
    .collection("bookingDrafts")
    .findOne({ stripeSessionId: sessionId });

  const existing = await db
    .collection("bookings")
    .findOne({ stripeSessionId: sessionId });

  if (!draft && !existing) {
    return res.status(404).json({ message: "Checkout session not found" });
  }

  if (draft && String(draft.customerId) !== req.user.id) {
    return res.status(403).json({ message: "This checkout is not yours" });
  }

  if (draft?.provider === "stripe") {
    const stripe = stripeClient();

    if (!stripe) {
      return res
        .status(503)
        .json({ message: "Stripe is not configured on the server" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return res.status(402).json({ message: "Payment has not completed yet" });
    }
  }

  const result = await confirmBookingDraft(db, sessionId);

  if (result.error) {
    return res.status(404).json({ message: result.error });
  }

  res.json({
    data: {
      booking: serialize(result.booking),
      duplicate: Boolean(result.duplicate),
    },
  });
});

export default router;
