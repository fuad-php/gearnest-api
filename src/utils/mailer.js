import nodemailer from "nodemailer";

let transporter;
let initialised = false;

function getTransport() {
  if (initialised) return transporter;
  initialised = true;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    transporter = null;
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass },
  });

  return transporter;
}

export function mailEnabled() {
  return Boolean(getTransport());
}

/**
 * Sends an email when SMTP is configured. Without credentials the message is
 * logged instead, so local development and demos still show what would be sent.
 */
export async function sendMail({ to, subject, text, html }) {
  if (!to) return { skipped: true, reason: "no-recipient" };

  const transport = getTransport();
  const from =
    process.env.MAIL_FROM ||
    process.env.SMTP_USER ||
    "GearNest <no-reply@gearnest.com>";

  if (!transport) {
    console.log(`[mail:skipped] ${subject} -> ${to}`);
    return { skipped: true, reason: "smtp-not-configured" };
  }

  try {
    await transport.sendMail({ from, to, subject, text, html });
    console.log(`[mail:sent] ${subject} -> ${to}`);
    return { sent: true };
  } catch (error) {
    console.error(`[mail:error] ${subject} -> ${to}: ${error.message}`);
    return { sent: false, error: error.message };
  }
}
