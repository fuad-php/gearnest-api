import formData from "form-data";
import Mailgun from "mailgun.js";
import nodemailer from "nodemailer";

let smtpTransport;
let smtpInitialised = false;

let mailgun;
let mailgunInitialised = false;

/**
 * Mailgun HTTP API. Preferred over SMTP: it works on hosts that block
 * outbound SMTP ports and returns a per-message id for the logs.
 */
function getMailgun() {
  if (mailgunInitialised) return mailgun;
  mailgunInitialised = true;

  const key = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;

  if (!key || !domain) {
    mailgun = null;
    return null;
  }

  const client = new Mailgun(formData).client({
    username: "api",
    key,
    // EU-hosted domains live on a different endpoint.
    ...(process.env.MAILGUN_REGION === "eu"
      ? { url: "https://api.eu.mailgun.net" }
      : {}),
  });

  mailgun = { client, domain };
  return mailgun;
}

function getTransport() {
  if (smtpInitialised) return smtpTransport;
  smtpInitialised = true;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    smtpTransport = null;
    return null;
  }

  smtpTransport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass },
  });

  return smtpTransport;
}

/** "mailgun" | "smtp" | "console" — logged at boot so the setup is obvious. */
export function mailProvider() {
  if (getMailgun()) return "mailgun";
  if (getTransport()) return "smtp";
  return "console";
}

export function mailEnabled() {
  return mailProvider() !== "console";
}

function fromAddress() {
  return (
    process.env.MAIL_FROM ||
    process.env.SMTP_USER ||
    "GearNest <no-reply@gearnest.com>"
  );
}

function mailgunError(error) {
  if (!error) return "unknown error";
  if (typeof error === "string") return error;
  return (
    error.details ||
    error.message ||
    (error.status ? `Mailgun responded with ${error.status}` : String(error))
  );
}

/**
 * Sends an email through Mailgun when configured, then SMTP, and finally logs
 * the message when neither is set up — so local development and demos still
 * show exactly what would have been delivered.
 */
export async function sendMail({ to, subject, text, html }) {
  if (!to) return { skipped: true, reason: "no-recipient" };

  const from = fromAddress();
  const mailgunConfig = getMailgun();

  if (mailgunConfig) {
    try {
      const result = await mailgunConfig.client.messages.create(
        mailgunConfig.domain,
        { from, to, subject, text, html },
      );

      console.log(
        `[mail:sent:mailgun] ${subject} -> ${to} (id ${result?.id ?? "n/a"})`,
      );
      return { sent: true, provider: "mailgun", id: result?.id };
    } catch (error) {
      const message = mailgunError(error);
      console.error(`[mail:error:mailgun] ${subject} -> ${to}: ${message}`);
      return { sent: false, provider: "mailgun", error: message };
    }
  }

  const transport = getTransport();

  if (transport) {
    try {
      await transport.sendMail({ from, to, subject, text, html });
      console.log(`[mail:sent:smtp] ${subject} -> ${to}`);
      return { sent: true, provider: "smtp" };
    } catch (error) {
      console.error(`[mail:error:smtp] ${subject} -> ${to}: ${error.message}`);
      return { sent: false, provider: "smtp", error: error.message };
    }
  }

  console.log(`[mail:skipped] ${subject} -> ${to}`);
  return { skipped: true, reason: "mail-not-configured" };
}
