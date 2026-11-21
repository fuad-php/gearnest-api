
import formData from "form-data";
import Mailgun from "mailgun.js";
import nodemailer from "nodemailer";

let smtpTransport;
let smtpInitialised = false;

let mailgun;
let mailgunInitialised = false;

/**
 * Initialize Mailgun HTTP API.
 */
function getMailgun() {
  if (mailgunInitialised) return mailgun;

  const key = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;

  if (!key || !domain) {
    mailgunInitialised = true;
    mailgun = null;
    return mailgun;
  }

  try {
    const client = new Mailgun(formData).client({
      username: "api",
      key,
      ...(process.env.MAILGUN_REGION === "eu"
        ? { url: "https://api.eu.mailgun.net" }
        : {}),
    });

    mailgun = { client, domain };
    mailgunInitialised = true;

    return mailgun;
  } catch (error) {
    console.error("[mail:init:mailgun]", getErrorMessage(error));

    mailgun = null;
    mailgunInitialised = true;

    return null;
  }
}

/**
 * Initialize SMTP transport.
 */
function getTransport() {
  if (smtpInitialised) return smtpTransport;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    smtpInitialised = true;
    smtpTransport = null;
    return smtpTransport;
  }

  try {
    smtpTransport = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user,
        pass,
      },
    });

    smtpInitialised = true;

    return smtpTransport;
  } catch (error) {
    console.error("[mail:init:smtp]", getErrorMessage(error));

    smtpTransport = null;
    smtpInitialised = true;

    return null;
  }
}

/**
 * Normalize error messages.
 */
function getErrorMessage(error) {
  if (!error) return "Unknown error";

  if (typeof error === "string") return error;

  return (
    error.details ||
    error.message ||
    (error.status
      ? `Mailgun responded with ${error.status}`
      : String(error))
  );
}

/**
 * Get sender email address.
 */
function fromAddress() {
  return (
    process.env.MAIL_FROM ||
    process.env.SMTP_USER ||
    "GearNest <no-reply@gearnest.com>"
  );
}

/**
 * Get active mail provider.
 */
export function mailProvider() {
  if (getMailgun()) return "mailgun";
  if (getTransport()) return "smtp";

  return "console";
}

/**
 * Check whether email delivery is configured.
 */
export function mailEnabled() {
  return Boolean(getMailgun() || getTransport());
}

/**
 * Send email.
 *
 * Priority:
 * 1. Mailgun
 * 2. SMTP fallback
 * 3. Console fallback
 */
export async function sendMail({
  to,
  subject,
  text,
  html,
}) {
  // Validate recipient
  if (
    !to ||
    (typeof to !== "string" && !Array.isArray(to))
  ) {
    return {
      sent: false,
      skipped: true,
      reason: "no-recipient",
    };
  }

  // Validate message content
  if (
    typeof subject !== "string" ||
    !subject.trim() ||
    (!text && !html)
  ) {
    return {
      sent: false,
      skipped: true,
      reason: "invalid-email-content",
    };
  }

  const from = fromAddress();

  // 1. Try Mailgun first
  const mailgunConfig = getMailgun();

  if (mailgunConfig) {
    try {
      const result =
        await mailgunConfig.client.messages.create(
          mailgunConfig.domain,
          {
            from,
            to,
            subject,
            ...(text ? { text } : {}),
            ...(html ? { html } : {}),
          }
        );

      console.log(
        `[mail:sent:mailgun] ${subject} -> ${to} (id: ${result?.id ?? "n/a"})`
      );

      return {
        sent: true,
        provider: "mailgun",
        id: result?.id,
      };
    } catch (error) {
      console.error(
        `[mail:error:mailgun] ${subject} -> ${to}: ${getErrorMessage(error)}`
      );

      // Continue to SMTP fallback
    }
  }

  // 2. Try SMTP fallback
  const transport = getTransport();

  if (transport) {
    try {
      const result = await transport.sendMail({
        from,
        to,
        subject,
        ...(text ? { text } : {}),
        ...(html ? { html } : {}),
      });

      console.log(
        `[mail:sent:smtp] ${subject} -> ${to} (id: ${result.messageId})`
      );

      return {
        sent: true,
        provider: "smtp",
        id: result.messageId,
      };
    } catch (error) {
      const message = getErrorMessage(error);

      console.error(
        `[mail:error:smtp] ${subject} -> ${to}: ${message}`
      );

      return {
        sent: false,
        provider: "smtp",
        error: message,
      };
    }
  }

  // 3. No provider configured
  console.log(
    `[mail:skipped] ${subject} -> ${to}`
  );

  return {
    sent: false,
    skipped: true,
    reason: "mail-not-configured",
  };
}
