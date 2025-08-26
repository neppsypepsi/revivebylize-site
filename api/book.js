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
