import { google } from 'googleapis';

const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/calendar']
);
const calendar = google.calendar({ version: 'v3', auth });
const TZ = process.env.TIMEZONE || 'America/Los_Angeles';

/** Business hours per weekday [startMin, endMin] — Sun..Sat */
const HOURS = {
  0: [12 * 60, 18 * 60], // Sun 12–6p
  1: [17 * 60, 21 * 60], // Mon 5–9p
  2: [17 * 60, 21 * 60], // Tue 5–9p
  3: [0, 0],             // Wed closed
  4: [17 * 60, 21 * 60], // Thu 5–9p
  5: [0, 0],             // Fri closed
  6: [10 * 60, 16 * 60], // Sat 10a–4p
};

const DUR = {
  'Gentle Recovery Flow (60 min)': 60,
  'Total Body Renewal (60 min)': 60,
  'Radiance Facial Flow (45 min)': 45,
};

const PRE = 15;   // minutes buffer before
const POST = 15;  // minutes buffer after
const STEP = 15;  // slot granularity

function parseLocalDateYMD(ymd) {
  // Treat "YYYY-MM-DD" as a LOCAL date (not UTC) to avoid timezone drift
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m - 1), d, 0, 0, 0, 0);
}

function fmtLabel(d) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: TZ });
}

export default async function handler(req, res) {
  try {
    const { date, service } = req.query;
    if (!date) return res.status(400).json({ error: 'date required' });

    const serviceMin = DUR[service] || 60;
    const need = serviceMin + PRE + POST; // total blocked window around an appt

    // Build LOCAL day window (midnight to midnight local)
    // IMPORTANT: using constructor with y/m/d keeps it in local tz
    const dayStartLocal = parseLocalDateYMD(String(date));
    const dayEndLocal = new Date(dayStartLocal.getTime() + 24 * 60 * 60 * 1000 - 1);

    const dow = dayStartLocal.getDay();
    const [startMin, endMin] = HOURS[dow] || [0, 0];
    if (startMin >= endMin) return res.json({ slots: [] });

    // Query Google FreeBusy (busy only) for this calendar in the same TZ
    const fb = await calendar.freebusy.query({
      requestBody: {
        timeMin: dayStartLocal.toISOString(),
        timeMax: new Date(dayStartLocal.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        timeZone: TZ,
        items: [{ id: process.env.CALENDAR_ID }],
      },
    });

    const busy = (fb.data.calendars?.[process.env.CALENDAR_ID]?.busy || [])
      .map(b => [Date.parse(b.start), Date.parse(b.end)])
      .sort((a, b) => a[0] - b[0]);

    // Build the business-hours window in ms
    const windowStart = dayStartLocal.getTime() + startMin * 60000;
    const windowEnd   = dayStartLocal.getTime() + endMin   * 60000;

    const now = Date.now();
    const out = [];

    for (let t = windowStart; t + need * 60000 <= windowEnd; t += STEP * 60000) {
      if (t < now) continue;

      // Appointment would *start* after PRE buffer and *end* before POST buffer
      const slotStart = t + PRE * 60000;               // what the client actually books
      const slotEnd   = slotStart + serviceMin * 60000; // appointment end
      const totalStart = t;                             // includes buffers
      const totalEnd   = slotEnd + POST * 60000;

      // Conflict if ANY busy interval overlaps our total block
      const conflict = busy.some(([bS, bE]) => !(totalEnd <= bS || totalStart >= bE));
      if (!conflict) {
        const startDate = new Date(slotStart);
        out.push({
          iso: startDate.toISOString(),  // machine value (UTC ISO)
          label: fmtLabel(startDate),    // human label in TZ
        });
      }
    }

    res.json({ slots: out });
  } catch (e) {
    console.error('availability error', e?.message || e);
    res.status(500).json({ error: 'freebusy failed' });
  }
}
