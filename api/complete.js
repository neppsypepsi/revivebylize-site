import { google } from 'googleapis';
import nodemailer from 'nodemailer';

/**
 * Admin-only endpoint to mark a booking as COMPLETED and send a thank-you email.
 * - Auth via Bearer token (ADMIN_TOKEN)
 * - Reads the event to get details + client email
 * - Sends a thank-you email to the client (and optional owner notice)
 * - Updates event.extendedProperties.private:
 *      completed = 'true'
 *      thankYouSent = 'true'
 *   (while preserving any existing private fields)
 */

// ---- Google Calendar auth ----
const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/calendar']
);
const calendar = google.calendar({ version: 'v3', auth });
const TZ = process.env.TIMEZONE || 'America/Los_Angeles';

// ---- Admin auth helper ----
function okAuth(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  return token && token === process.env.ADMIN_TOKEN;
}

// ---- Nodemailer transport ----
function mailer() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

// ---- Extract client email from private props or description ----
function extractClientEmail(ev) {
  const fromPrivate = ev?.extendedProperties?.private?.email;
  if (fromPrivate) return fromPrivate;
  const desc = ev?.description || '';
  const m = desc.match(/Contact:\s*([^\s]+@[^\s]+)/i);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!okAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'missing id' });

    // 1) Read the event
    const { data: ev } = await calendar.events.get({
      calendarId: process.env.CALENDAR_ID,
      eventId: id,
    });

    const clientEmail = extractClientEmail(ev);
    const service = ev?.summary || 'Massage session';
    const startISO = ev?.start?.dateTime || ev?.start?.date;
    const start = startISO ? new Date(startISO) : null;
    const prettyDate = start
      ? new Intl.DateTimeFormat('en-US', {
          weekday: 'long', month: 'short', day: 'numeric', year: 'numeric',
          hour: 'numeric', minute: '2-digit', timeZone: TZ,
        }).format(start)
      : '(date unknown)';

    // 2) Send thank-you email (best-effort; do not block completion if SMTP missing)
    const tx = mailer();
    const from = process.env.FROM_EMAIL || process.env.SMTP_USER;
    const owner = process.env.OWNER_EMAIL || from;

    if (tx && clientEmail) {
      try {
        await tx.sendMail({
          from,
          to: clientEmail,
          subject: 'Thank you — Revive by Lize',
          text:
            `Hello,\n\n` +
            `Thank you for choosing Revive by Lize for your "${service}".\n` +
            `We hope you’re feeling relaxed and renewed.\n\n` +
            `Self‑care tip: Drink water today and take a gentle walk to support circulation.\n\n` +
            `If you’d like to book your next session, just reply to this email or visit our site.\n\n` +
            `— Revive by Lize`,
        });
      } catch (mailErr) {
        console.error('ADMIN/complete: client thank-you email failed', {
          message: mailErr?.message,
          code: mailErr?.code,
          responseCode: mailErr?.responseCode,
        });
      }
    }

    if (tx && owner) {
      try {
        await tx.sendMail({
          from,
          to: owner,
          subject: 'Marked completed — Revive by Lize',
          text:
            `A booking was marked completed.\n\n` +
            `Service: ${service}\n` +
            `When: ${prettyDate} (${TZ})\n` +
            `Client email: ${clientEmail || 'n/a'}\n` +
            `Event ID: ${id}\n`,
        });
      } catch (mailErr) {
        console.error('ADMIN/complete: owner email failed', {
          message: mailErr?.message,
          code: mailErr?.code,
          responseCode: mailErr?.responseCode,
        });
      }
    }

    // 3) Mark the event as completed + thankYouSent in private props (preserving existing)
    const existingPrivate = ev?.extendedProperties?.private || {};
    const updatedPrivate = {
      ...existingPrivate,
      completed: 'true',
      thankYouSent: 'true',
    };

    await calendar.events.patch({
      calendarId: process.env.CALENDAR_ID,
      eventId: id,
      requestBody: {
        extendedProperties: {
          private: updatedPrivate,
        },
      },
      sendUpdates: 'none',
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('ADMIN/complete failed', {
      message: e?.message,
      code: e?.code,
      response: e?.response?.data || e?.response,
    });
    res.status(500).json({ error: 'complete failed' });
  }
}
