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
// Required env vars (Vercel → Settings → Environment Variables):
// SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS, FROM_EMAIL, OWNER_EMAIL
async function sendMail({ to, subject, text, html }) {
  if (!process.env.SMTP_HOST) return; // quietly skip if not configured
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const from = process.env.FROM_EMAIL || process.env.SMTP_USER;
  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { isoStart, service, name, email } = req.body || {};
    if (!isoStart || !service || !email) {
      return res.status(400).json({ error: 'missing fields' });
    }

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
        // attendees: [{ email }], // disabled: requires domain-wide delegation
        reminders: { useDefault: true },
        visibility: 'private',
        guestsCanInviteOthers: false,
        guestsCanModify: false,
        guestsCanSeeOtherGuests: false,
      },
    });

    // Fire-and-forget confirmation emails (don’t block the response)
    (async () => {
      try {
        const prettyDate = start.toLocaleString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZone: TZ,
        });

        // To the client
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

        // To the owner
        const owner = process.env.OWNER_EMAIL || process.env.FROM_EMAIL;
        if (owner) {
          await sendMail({
            to: owner,
            subject: `New booking — ${service} (${prettyDate})`,
            text:
              `New booking received:\n\n` +
              `Service: ${service}\n` +
              `When: ${prettyDate} (${TZ})\n` +
              `Client: ${name || 'Guest'}\n` +
              `Email: ${email}\n\n` +
              `Google Event ID: ${ev.data.id}\n`,
          });
        }
      } catch (err) {
        console.error('Email send failed:', err);
      }
    })();

    res.json({ ok: true, id: ev.data.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'booking failed' });
  }
}
