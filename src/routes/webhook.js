import Stripe from "stripe";
import { getDB } from "../config/db.js";
import { confirmBookingDraft } from "../utils/bookings.js";

export async function stripeWebhook(req, res) {
  const key = process.env.STRIPE_SECRET_KEY;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!key || !secret) {
    return res
      .status(503)
      .json({ message: "Stripe webhook is not configured on the server" });
  }

  const stripe = new Stripe(key);
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      secret,
    );
  } catch (error) {
    return res
      .status(400)
      .json({ message: `Webhook signature check failed: ${error.message}` });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    if (session.payment_status === "paid") {
      await confirmBookingDraft(getDB(), session.id);
    }
  }

  res.json({ received: true });
}
