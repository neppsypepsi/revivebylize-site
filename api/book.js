import { google } from 'googleapis';
import nodemailer from 'nodemailer';

// ---- Google Calendar auth (service account) ----
const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/calendar']
);
const calendar = google.calendar({ version: 'v3', auth });
const TZ = process.env.TIMEZONE || 'America/Los_Angeles';

// ---- Durations per service (minutes) ----
const DUR = {
  'Gentle Recovery Flow (60 min)': 60,
  'Total Body Renewal (60 min)': 60,
  'Radiance Facial Flow (45 min)': 45,
};

// ---- Email helper (Zoho SMTP or any SMTP) ----
// Required env vars: SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS, FROM_EMAIL, OWNER_EMAIL
async function sendMail({ to, subject, text, html }) {
  if (!process.env.SMTP_HOST) {
    console.log('BOOK: SMTP not configured, skipping email');
    return;
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    logger: !!process.env.SMTP_DEBUG,
    debug: !!process.env.SMTP_DEBUG,
  });

  const from = process.env.FROM_EMAIL || process.env.SMTP_USER;
  return transporter.sendMail({ from, to, subject, text, html });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { isoStart, service, name, email } = req.body || {};
    if (!isoStart || !service || !email) {
      return res.status(400).json({ error: 'missing fields' });
    }

    console.log('BOOK: handler start', { isoStart, service, email });

    const start = new Date(isoStart);
    const end = new Date(+start + (DUR[service] || 60) * 60000);

    // Insert event WITHOUT attendees (service accounts can’t invite)
    const ev = await calendar.events.insert({
      calendarId: process.env.CALENDAR_ID,
      sendUpdates: 'none',
      requestBody: {
        summary: `${service} — Revive by Lize`,
        description: `Client: ${name || 'Guest'}\nService: ${service}\nContact: ${email}\nPolicy: 24h reschedule; $25 late-cancel via Zelle.`,
        start: { dateTime: start.toISOString(), timeZone: TZ },
        end: { dateTime: end.toISOString(), timeZone: TZ },
        reminders: { useDefault: true },
        visibility: 'private',
        guestsCanInviteOthers: false,
        guestsCanModify: false,
        guestsCanSeeOtherGuests: false,
      },
    });

    console.log('BOOK: event created', {
      id: ev?.data?.id,
      start: start.toISOString(),
      service,
      email,
    });

    // Send emails (await so logs appear in Vercel)
    const prettyDate = start.toLocaleString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: TZ,
    });

    try {
      // To the client
      console.log('BOOK: sending client email to', email);
      await sendMail({
        to: email,
        subject: `Your booking is confirmed — ${service}`,
        text:
          `Hi ${name || 'there'},\n\n` +
          `Thanks for booking *${service}* with Revive by Lize.\n` +
          `🗓  When: ${prettyDate} (${TZ})\n` +
          `📍 Location: Provided in confirmation or by message\n\n` +
          `If you need to reschedule, please reply to this email at least 24 hours in advance.\n\n` +
          `— Revive by Lize`,
      });
      console.log('BOOK: client email sent');

      // To the owner
      const owner = process.env.OWNER_EMAIL || process.env.FROM_EMAIL || process.env.SMTP_USER;
      if (owner) {
        console.log('BOOK: sending owner email to', owner);
        await sendMail({
          to: owner,
          subject: `New booking — ${service} (${prettyDate})`,
          text:
            `New booking received:\n\n` +
            `Service: ${service}\n` +
            `When: ${prettyDate} (${TZ})\n` +
            `Client: ${name || 'Guest'}\n` +
            `Email: ${email}\n\n` +
            `Google Event ID: ${ev?.data?.id}\n`,
        });
        console.log('BOOK: owner email sent');
      } else {
        console.log('BOOK: owner email skipped (no OWNER_EMAIL/FROM_EMAIL set)');
      }
    } catch (mailErr) {
      console.error('BOOK: Email send failed', {
        message: mailErr?.message,
        code: mailErr?.code,
        responseCode: mailErr?.responseCode,
      });
    }

    // Respond after emails so logs are visible in this request
    res.json({ ok: true, id: ev.data.id });
  } catch (e) {
    console.error('BOOK: handler failed', {
      message: e?.message,
      code: e?.code,
      response: e?.response?.data || e?.response,
    });
    res.status(500).json({ error: 'booking failed' });
  }
}
