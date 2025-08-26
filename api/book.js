import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';

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
    const { isoStart, service, name, email, location, address } = req.body || {};
    if (!isoStart || !service || !email) {
      return res.status(400).json({ error: 'missing fields' });
    }

    console.log('BOOK: handler start', { isoStart, service, email });

    const start = new Date(isoStart);
    const end = new Date(+start + (DUR[service] || 60) * 60000);

    const isMobile = location === 'mobile';
    const locLines = isMobile
      ? `Location: Mobile visit\nAddress: ${address || '(not provided)'}\nTravel fee: $15 flat\n`
      : `Location: In-studio\nTravel fee: none\n`;

    // Insert event WITHOUT attendees (service accounts can’t invite)
    const ev = await calendar.events.insert({
      calendarId: process.env.CALENDAR_ID,
      sendUpdates: 'none',
      requestBody: {
        summary: `${service} — Revive by Lize`,
        description:
          `Client: ${name || 'Guest'}\n` +
          `Service: ${service}\n` +
          `Contact: ${email}\n` +
          locLines +
          `Policy: 24h reschedule; $25 late-cancel via Zelle.`,
        start: { dateTime: start.toISOString(), timeZone: TZ },
        end: { dateTime: end.toISOString(), timeZone: TZ },
        extendedProperties: {
          private: {
            email,
            service,
            location: isMobile ? 'mobile' : 'studio',
            address: address || '',
            travelFee: isMobile ? '15' : '0',
            completed: 'false'
          }
        },
        reminders: { useDefault: true },
        visibility: 'private',
        guestsCanInviteOthers: false,
        guestsCanModify: false,
        guestsCanSeeOtherGuests: false,
    });

    // ---- Self-cancel link (valid for 7 days) ----
    const ts = Date.now().toString();
    const base = process.env.PUBLIC_BASE_URL || '';
    const secret = process.env.SELF_CANCEL_SECRET || '';
    const evId = ev?.data?.id;
    const payload = evId ? `${evId}.${ts}` : '';
    const sig = (secret && payload) ? crypto.createHmac('sha256', secret).update(payload).digest('hex') : '';
    const selfCancelURL = (base && sig && evId)
      ? `${base}/api/self-cancel?id=${encodeURIComponent(evId)}&ts=${ts}&sig=${sig}`
      : '';

    // ---- Email: client + owner confirmations ----
    const prettyDate = new Intl.DateTimeFormat('en-US', {
      weekday: 'long', month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: TZ,
    }).format(start);

    const locEmailText = isMobile
      ? `Location: Mobile visit\nAddress: ${address || '(not provided)'}\nTravel fee: $15 flat\n`
      : `Location: In-studio (no travel fee)\n`;

    // Client email
    try {
      await sendMail({
        to: email,
        subject: 'Your booking is confirmed — Revive by Lize',
        text:
          `Hi ${name || 'there'},\n\n` +
          `Thanks for booking *${service}* with Revive by Lize.\n` +
          `🗓  When: ${prettyDate} (${TZ})\n` +
          locEmailText +
          (selfCancelURL ? `Cancel link (valid 7 days): ${selfCancelURL}\n\n` : '') +
          `If you need to reschedule, please reply at least 24 hours in advance.\n\n` +
          `— Revive by Lize`,
      });
      console.log('BOOK: client email sent to', email);
    } catch (mailErr) {
      console.error('BOOK: client email failed', mailErr?.message || mailErr);
    }

    // Owner email
    try {
      const owner = process.env.OWNER_EMAIL || process.env.FROM_EMAIL || process.env.SMTP_USER;
      if (owner) {
        await sendMail({
          to: owner,
          subject: 'New booking — Revive by Lize',
          text:
            `New booking received.\n\n` +
            `Service: ${service}\n` +
            `When: ${prettyDate} (${TZ})\n` +
            `Client email: ${email}\n` +
            `Location: ${isMobile ? 'Mobile' : 'In-studio'}\n` +
            (isMobile ? `Address: ${address || '(not provided)'}\nTravel fee: $15\n` : ``) +
            (evId ? `Event ID: ${evId}\n` : ``) +
            (selfCancelURL ? `Client cancel link: ${selfCancelURL}\n` : ``),
        });
        console.log('BOOK: owner email sent to', owner);
      }
    } catch (mailErr) {
      console.error('BOOK: owner email failed', mailErr?.message || mailErr);
    }

    res.json({ ok: true, id: ev.data?.id, cancelLink: !!selfCancelURL });
  } catch (e) {
    console.error('BOOK: handler error', e);
    res.status(500).json({ error: 'internal error' });
  }
}
