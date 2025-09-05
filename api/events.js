import { google } from 'googleapis';

// ---- Google Calendar auth ----
const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/calendar']
);
const calendar = google.calendar({ version: 'v3', auth });

function okAuth(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  return token && token === process.env.ADMIN_TOKEN;
}

export default async function handler(req, res) {
  if (!okAuth(req)) return res.status(401).json({ error: 'unauthorized' });
  const showAll = req.query?.all === '1';
  const debugMode = req.query?.debug === '1';
  try {
    const now = new Date();
    const result = await calendar.events.list({
      calendarId: process.env.CALENDAR_ID,
      timeMin: now.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    });

    const items = result.data.items || [];

    // Only include events created by the website booking flow unless ?all=1 is passed.
    // We detect site bookings by:
    //  - explicit marker: extendedProperties.private.source === 'revive-site' (new)
    //  - legacy site events that had a private.service string
    //  - OR summary contains our brand suffix (belt & suspenders)
    const siteOnly = showAll ? items : items.filter(ev =>
      ev?.extendedProperties?.private?.source === 'revive-site' ||
      typeof ev?.extendedProperties?.private?.service === 'string' ||
      (typeof ev?.summary === 'string' && ev.summary.includes('— Revive by Lize'))
    );

    const events = siteOnly.map(ev => ({
      id: ev.id,
      summary: ev.summary,
      start: ev.start?.dateTime || ev.start?.date,
      end: ev.end?.dateTime || ev.end?.date,
      description: ev.description || '',
      location: ev.extendedProperties?.private?.location || '',
      address: ev.extendedProperties?.private?.address || '',
      travelFee: ev.extendedProperties?.private?.travelFee || '0',
      completed: ev.extendedProperties?.private?.completed || 'false',
      extEmail: ev.extendedProperties?.private?.email || ''
    }));

    if (debugMode) {
      return res.json({
        ok: true,
        total: items.length,
        filtered: events.length,
        sampleSummaries: items.slice(0,5).map(e => e?.summary || '(no summary)'),
        events
      });
    }

    res.json({ ok: true, events });
  } catch (e) {
    console.error('ADMIN/events failed', e?.message || e);
    res.status(500).json({ error: 'failed to list events' });
  }
}
