const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

function money(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function range(start, end) {
  return `${formatDate(start)} → ${formatDate(end)}`;
}

function layout({ eyebrow, title, intro, rows, cta, footer }) {
  const rowsHtml = rows
    .map(
      (row) => `
        <tr>
          <td style="padding:10px 0;border-top:1px solid #dcd7cb;color:#5f6a63;font-size:13px;">${row.label}</td>
          <td style="padding:10px 0;border-top:1px solid #dcd7cb;color:#14231c;font-size:13px;text-align:right;font-weight:600;">${row.value}</td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f6f3ec;font-family:Inter,Helvetica,Arial,sans-serif;color:#14231c;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3ec;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dcd7cb;border-radius:14px;padding:32px;">
            <tr>
              <td style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#5f6a63;">${eyebrow}</td>
            </tr>
            <tr>
              <td style="padding-top:14px;font-size:24px;font-weight:700;line-height:1.2;">${title}</td>
            </tr>
            <tr>
              <td style="padding-top:10px;font-size:14px;line-height:1.6;color:#5f6a63;">${intro}</td>
            </tr>
            <tr>
              <td style="padding-top:18px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
              </td>
            </tr>
            <tr>
              <td style="padding-top:22px;">
                <a href="${cta.href}" style="display:inline-block;background:#17493a;color:#f6f3ec;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:10px;">${cta.label}</a>
              </td>
            </tr>
            <tr>
              <td style="padding-top:24px;border-top:1px solid #dcd7cb;font-size:12px;line-height:1.6;color:#5f6a63;">${footer}</td>
            </tr>
          </table>
          <p style="max-width:560px;margin:16px auto 0;font-size:11px;color:#8a938d;text-align:center;">
            GearNest · 120 Congress Ave, Austin, TX 78701 · This is an automated message.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Builds the two emails sent when a booking is marked completed:
 * one for the renter and one for the equipment owner.
 */
export function completionEmails(booking, ownerEmail) {
  const emails = [];
  const dates = range(booking.rentalStartDate, booking.rentalEndDate);
  const total = money(booking.totalAmountCents);

  if (booking.customerEmail) {
    emails.push({
      to: booking.customerEmail,
      subject: `Rental complete — ${booking.equipmentName}`,
      text: [
        `Hi ${booking.customerName},`,
        "",
        `Your rental of ${booking.equipmentName} is now marked complete.`,
        `Dates: ${dates}`,
        `Total paid: ${total}`,
        "",
        `View your rentals: ${CLIENT_URL}/dashboard/rentals`,
        "",
        "Thanks for renting with GearNest.",
      ].join("\n"),
      html: layout({
        eyebrow: "Rental complete",
        title: `Your ${booking.equipmentName} rental is complete`,
        intro: `Hi ${booking.customerName}, the rental period has ended and the booking is now closed out. Thanks for using GearNest.`,
        rows: [
          { label: "Equipment", value: booking.equipmentName },
          { label: "Dates", value: dates },
          { label: "Quantity", value: `${booking.quantity} unit${booking.quantity === 1 ? "" : "s"}` },
          { label: "Total paid", value: total },
          { label: "Owner", value: booking.ownerName || "GearNest owner" },
        ],
        cta: {
          href: `${CLIENT_URL}/dashboard/rentals`,
          label: "View my rentals",
        },
        footer:
          "If something was not right with this rental, reply to this message or contact hello@gearnest.com and we will step in.",
      }),
    });
  }

  if (ownerEmail) {
    emails.push({
      to: ownerEmail,
      subject: `Rental completed — ${booking.equipmentName}`,
      text: [
        `Hi ${booking.ownerName || "there"},`,
        "",
        `The rental of ${booking.equipmentName} by ${booking.customerName} is now complete.`,
        `Dates: ${dates}`,
        `Earnings recorded: ${total}`,
        "",
        `Review your rentals: ${CLIENT_URL}/dashboard/owner/rentals`,
        "",
        "Thanks for listing with GearNest.",
      ].join("\n"),
      html: layout({
        eyebrow: "Rental completed",
        title: `${booking.equipmentName} has been returned`,
        intro: `Hi ${booking.ownerName || "there"}, ${booking.customerName} completed their rental. The booking is closed out and the payment is recorded in your analytics.`,
        rows: [
          { label: "Equipment", value: booking.equipmentName },
          { label: "Renter", value: `${booking.customerName} · ${booking.customerEmail}` },
          { label: "Dates", value: dates },
          { label: "Quantity", value: `${booking.quantity} unit${booking.quantity === 1 ? "" : "s"}` },
          { label: "Earnings", value: total },
        ],
        cta: {
          href: `${CLIENT_URL}/dashboard/owner/rentals`,
          label: "Open owner dashboard",
        },
        footer:
          "Mark rentals active on handover and completed on return so your calendar and analytics stay accurate.",
      }),
    });
  }

  return emails;
}
