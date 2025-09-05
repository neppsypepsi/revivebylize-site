import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';

const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/calendar']
);
const calendar = google.calendar({ version: 'v3', auth });
const TZ = process.env.TIMEZONE || 'America/Los_Angeles';

// 2h25m per session (matches availability)
const SESSION_MINUTES = 145;

// Email helper (optional)
async function sendMail({ to, subject, text }) {
  if (!process.env.SMTP_HOST) return;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const from = process.env.FROM_EMAIL || process.env.SMTP_USER;
  return transporter.sendMail({ from, to, subject, text });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  try {
    const { isoStart, service, name, email, location, address } = req.body || {};
    if (!isoStart) return res.status(400).json({ error: 'isoStart required' });
    if (!service)  return res.status(400).json({ error: 'service required' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'valid email required' });
    if (location === 'mobile' && !address)
      return res.status(400).json({ error: 'address required for mobile' });

    const start = new Date(isoStart);
    if (isNaN(+start)) return res.status(400).json({ error: 'invalid isoStart' });
    const end = new Date(start.getTime() + SESSION_MINUTES * 60000);

    const isMobile = location === 'mobile';
    const summary = `${service} — Revive by Lize`;
    const description = [
      `Client: ${name || 'Guest'}`,
      `Service: ${service}`,
      `Contact: ${email}`,
      isMobile ? `Location: Mobile\nAddress: ${address || '(not provided)'}\nTravel fee: $15` : `Location: In-studio\nTravel fee: none`,
      `Policy: 24h reschedule; $25 late-cancel via Zelle.`,
    ].join('\n');

    const ev = await calendar.events.insert({
      calendarId: process.env.CALENDAR_ID,
      sendUpdates: 'none',
      requestBody: {
        summary,
        description,
        start: { dateTime: start.toISOString(), timeZone: TZ },
        end:   { dateTime: end.toISOString(),   timeZone: TZ },
        transparency: 'opaque', // mark Busy
        status: 'confirmed',
        extendedProperties: {
          private: {
            source: 'revive-site',
            email,
            service,
            location: isMobile ? 'mobile' : 'studio',
            address: isMobile ? (address || '') : '',
            travelFee: isMobile ? '15' : '0',
            completed: 'false',
          }
        },
        reminders: { useDefault: true },
        visibility: 'private',
        guestsCanInviteOthers: false,
        guestsCanModify: false,
        guestsCanSeeOtherGuests: false,
      }
    });

    // optional emails
    try {
      const pretty = new Intl.DateTimeFormat('en-US', {
        weekday: 'long', month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZone: TZ,
      }).format(start);
      if (process.env.SMTP_HOST) {
        await sendMail({
          to: email,
          subject: 'Your booking is confirmed — Revive by Lize',
          text: `Hi ${name || 'there'},\n\nThanks for booking ${service}.\nWhen: ${pretty} (${TZ})\n\n— Revive by Lize`
        });
        const owner = process.env.OWNER_EMAIL || process.env.FROM_EMAIL || process.env.SMTP_USER;
        if (owner) {
          await sendMail({
            to: owner,
            subject: 'New booking — Revive by Lize',
            text: `Service: ${service}\nWhen: ${pretty}\nClient: ${email}\nLocation: ${isMobile ? 'Mobile' : 'In-studio'}`
          });
        }
      }
    } catch {}

    return res.json({ ok: true, id: ev.data?.id || null });
  } catch (e) {
    console.error('BOOK error', e?.stack || e?.message || e);
    return res.status(500).json({ error: 'booking failed', message: e?.message || String(e) });
  }
}
