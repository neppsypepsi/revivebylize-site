import { google } from 'googleapis';
import nodemailer from 'nodemailer';

/**
 * Admin-only endpoint to cancel a booking:
 * - Auth via Bearer token (ADMIN_TOKEN)
 * - Fetches the event by ID to read details
 * - Deletes the event from Google Calendar
 * - Emails client + owner about the cancellation (if SMTP configured)
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

// ---- Nodemailer transport (Zoho SMTP or any SMTP) ----
function mailer() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

// Pull a client email from either private props or description
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

    // 1) Get event (so we can email the client + include details)
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

    // 2) Delete the event
    await calendar.events.delete({
      calendarId: process.env.CALENDAR_ID,
      eventId: id,
      sendUpdates: 'none', // service accounts cannot notify attendees
    });

    // 3) Send emails (best-effort)
    const tx = mailer();
    const from = process.env.FROM_EMAIL || process.env.SMTP_USER;
    const owner = process.env.OWNER_EMAIL || from;

    const tasks = [];

    if (tx && clientEmail) {
      tasks.push(tx.sendMail({
        from,
        to: clientEmail,
        subject: 'Your appointment was canceled — Revive by Lize',
        text:
          `Hello,\n\n` +
          `Your appointment (${service}) on ${prettyDate} was canceled by Revive by Lize.\n` +
          `If this is unexpected, please reply to reschedule.\n\n` +
          `— Revive by Lize`,
      }));
    }

    if (tx && owner) {
      tasks.push(tx.sendMail({
        from,
        to: owner,
        subject: 'Booking canceled — Revive by Lize',
        text:
          `A booking was canceled.\n\n` +
          `Service: ${service}\n` +
          `When: ${prettyDate} (${TZ})\n` +
          `Client email: ${clientEmail || 'n/a'}\n` +
          `Event ID: ${id}\n`,
      }));
    }

    if (tasks.length) await Promise.allSettled(tasks);

    res.json({ ok: true });
  } catch (e) {
    console.error('ADMIN/cancel failed', {
      message: e?.message,
      code: e?.code,
      response: e?.response?.data || e?.response,
    });
    res.status(500).json({ error: 'cancel failed' });
  }
}
