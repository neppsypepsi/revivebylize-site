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
    // Limit the admin view to the next 90 days so we don't drown in recurring/personal events
    const timeMax = new Date(now);
    timeMax.setDate(timeMax.getDate() + 90);
    let result = await calendar.events.list({
      calendarId: process.env.CALENDAR_ID,
      timeMin: now.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    });

    let items = result.data.items || [];
    let pageToken = result.data.nextPageToken;

    while (pageToken) {
      result = await calendar.events.list({
        calendarId: process.env.CALENDAR_ID,
        timeMin: now.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250,
        pageToken,
      });
      items = items.concat(result.data.items || []);
      pageToken = result.data.nextPageToken;
    }

    // Only include events created by the website booking flow unless ?all=1 is passed.
    // Broader matching: explicit marker, private email, service string, summary (em dash OR hyphen), or description client/contact.
    const siteOnly = showAll ? items : items.filter(ev =>
      ev?.extendedProperties?.private?.source === 'revive-site' ||
      ev?.extendedProperties?.private?.email ||
      typeof ev?.extendedProperties?.private?.service === 'string' ||
      /(?:—|-)\s*Revive by Lize/.test(ev?.summary || '') ||
      /\b(?:Client|Contact):\s/i.test(ev?.description || '')
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
