import { google } from 'googleapis';

const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/calendar']
);
const calendar = google.calendar({ version: 'v3', auth });
const TZ = process.env.TIMEZONE || 'America/Los_Angeles';

/** Business hours per weekday [startMin, endMin] — Sun..Sat
 *  Calendar-only mode: open 24h; Busy events fully control availability.
 */
const HOURS = {
  0: [0, 24 * 60], // Sun: 24h
  1: [0, 24 * 60], // Mon: 24h
  2: [0, 24 * 60], // Tue: 24h
  3: [0, 24 * 60], // Wed: 24h
  4: [0, 24 * 60], // Thu: 24h
  5: [0, 24 * 60], // Fri: 24h
  6: [0, 24 * 60], // Sat: 24h
};

const DUR = {
  'Gentle Recovery Flow (60 min)': 60,
  'Total Body Renewal (60 min)': 60,
  'Radiance Facial Flow (45 min)': 45,
};

const PRE = 0;    // minutes buffer before (aligns starts to exact hours)
const POST = 0;   // minutes buffer after
const STEP = 120; // slot granularity in minutes (2 hours between starts)

// ---- TZ helpers ----
function getTzOffsetMinutes(date, tz) {
  // Returns minutes to add to UTC to get local wall time in tz for the given instant
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map(p => [p.type, p.value]));
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return (asUTC - date.getTime()) / 60000;
}

function atTzStartOfDay(ymd, tz) {
  // ymd can be 'YYYY-MM-DD' or full ISO; returns Date at 00:00 in tz
  let y, m, d;
  if (typeof ymd === 'string' && ymd.includes('T')) {
    const t = new Date(ymd);
    const parts = ymd.split('T')[0].split('-').map(Number);
    y = parts[0]; m = parts[1]; d = parts[2];
  } else if (typeof ymd === 'string') {
    const parts = ymd.split('-').map(Number);
    y = parts[0]; m = parts[1]; d = parts[2];
  } else {
    const t = new Date(ymd);
    y = t.getUTCFullYear(); m = t.getUTCMonth() + 1; d = t.getUTCDate();
  }
  const utcGuess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offset = getTzOffsetMinutes(new Date(utcGuess), tz);
  return new Date(utcGuess - offset * 60000);
}

function clampIntervalToBusiness([s, e], windowStart, windowEnd) {
  const start = Math.max(s, windowStart);
  const end = Math.min(e, windowEnd);
  return start < end ? [start, end] : null;
}

function mergeIntervals(intervals) {
  if (!intervals.length) return [];
  intervals.sort((a, b) => a[0] - b[0]);
  const out = [intervals[0].slice()];
  for (let i = 1; i < intervals.length; i++) {
    const last = out[out.length - 1];
    const cur = intervals[i];
    if (cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1]);
    else out.push(cur.slice());
  }
  return out;
}

function alignToNextHourUTC(tMs, tz) {
  // Align epoch ms 'tMs' to the next local hour in TZ, then return as UTC ms
  const offsetMin = getTzOffsetMinutes(new Date(tMs), tz);
  const localMs = tMs + offsetMin * 60000; // convert to local wall-clock ms
  const alignedLocal = Math.ceil(localMs / 3600000) * 3600000; // next whole hour
  return alignedLocal - offsetMin * 60000; // back to UTC epoch ms
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  try {
    const { date, service } = req.query;
    const debugMode = req.query.debug === '1';
    if (!date) return res.status(400).json({ error: 'date required' });

    const serviceMin = 120; // force 2-hour sessions for all services
    const need = serviceMin + PRE + POST; // total blocked window around an appt

    // Build midnight boundaries in business timezone
    const dayStart = atTzStartOfDay(String(date), TZ);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const dow = new Date(dayStart).getUTCDay(); // dayStart represents the TZ midnight instant
    const [startMin, endMin] = HOURS[dow] || [0, 0];
    if (startMin >= endMin) return res.json({ slots: [] });

    // Query events for the day, expanded and ordered
    const resp = await calendar.events.list({
      calendarId: process.env.CALENDAR_ID,
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: TZ,
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      maxResults: 2500,
    });

    const items = resp.data.items || [];
    const debug = debugMode ? {
      date,
      tz: TZ,
      service,
      serviceMin,
      hoursWindowMins: [startMin, endMin],
      eventsCount: items.length,
      sampleEvents: items.slice(0, 5).map(e => ({
        id: e.id,
        summary: e.summary,
        transparency: e.transparency || 'opaque',
        allDay: !!(e.start?.date && e.end?.date),
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
      })),
    } : null;

    // Build the business-hours window in ms
    const windowStart = dayStart.getTime() + startMin * 60000;
    const windowEnd   = dayStart.getTime() + endMin   * 60000;

    // Convert events to busy intervals
    const busy = [];
    for (const ev of items) {
      const transparent = ev.transparency === 'transparent';
      const allDay = !!ev.start?.date && !!ev.end?.date;

      if (allDay) {
        if (transparent) continue; // 'Show me as: Free' shouldn't block
        // block entire business window for this day
        busy.push([windowStart, windowEnd]);
      } else {
        const s = Date.parse(ev.start?.dateTime);
        const e = Date.parse(ev.end?.dateTime);
        if (!isFinite(s) || !isFinite(e)) continue;
        const clamped = clampIntervalToBusiness([s, e], windowStart, windowEnd);
        if (clamped) busy.push(clamped);
      }
    }

    const merged = mergeIntervals(busy);

    // Invert busy to free intervals
    const free = [];
    let cursor = windowStart;
    for (const [bS, bE] of merged) {
      if (cursor < bS) free.push([cursor, bS]);
      cursor = Math.max(cursor, bE);
    }
    if (cursor < windowEnd) free.push([cursor, windowEnd]);

    // Generate slots
    const now = Date.now();
    const out = [];
    for (const [fS, fE] of free) {
      // Start at the next whole hour within the free window (in local TZ)
      let t = alignToNextHourUTC(Math.max(fS, now), TZ);
      const sessionMin = 120; // 2-hour session length
      while (t + sessionMin * 60000 <= fE) {
        const slotStart = t; // PRE=0, starts exactly on the hour
        const slotEnd   = slotStart + sessionMin * 60000; // 2-hour appointment
        if (slotStart >= now && slotEnd <= fE) {
          out.push(new Date(slotStart).toISOString());
        }
        // Advance by 2 hours between offered starts
        t += STEP * 60000; // STEP is 120
      }
    }

    if (debugMode) {
      return res.json({
        slots: out,
        debug: {
          ...debug,
          windowStartISO: new Date(windowStart).toISOString(),
          windowEndISO: new Date(windowEnd).toISOString(),
          busyIntervals: merged.map(([s,e]) => [new Date(s).toISOString(), new Date(e).toISOString()]),
          freeIntervals: free.map(([s,e]) => [new Date(s).toISOString(), new Date(e).toISOString()]),
        }
      });
    }
    return res.json({ slots: out });
  } catch (e) {
    const isDebug = req?.query?.debug === '1';
    console.error('availability error', e?.stack || e?.message || e);
    if (isDebug) {
      return res.status(200).json({
        error: 'availability failed',
        message: e?.message || String(e),
        stack: e?.stack || null,
        env: {
          hasCalendarId: !!process.env.CALENDAR_ID,
          hasClientEmail: !!process.env.GOOGLE_CLIENT_EMAIL,
          hasPrivateKey: !!process.env.GOOGLE_PRIVATE_KEY
        }
      });
    }
    return res.status(500).json({ error: 'availability failed' });
  }
}
