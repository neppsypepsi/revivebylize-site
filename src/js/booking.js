// ── Footer year ────────────────────────────────────────────────────────────
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ── Booking: custom calendar + API calls ───────────────────────────────────
const SERVICE_LABELS = [
  "Tailored to You — Lifestyle by Lize (~60 min)",
  "Brazilian Lymphatic Drainage (~60 min)",
  "Post-Procedure Lymphatic Flow (~45 min)"
];

const calEl      = document.getElementById('calendar');
const timeSel    = document.getElementById('time');
const svcSel     = document.getElementById('service');
const reqBtn     = document.getElementById('requestBtn');
const reqMsg     = document.getElementById('reqMsg');
const emailEl    = document.getElementById('clientEmail');
const nameEl     = document.getElementById('clientName');
const locSel     = document.getElementById('location');
const addrWrap   = document.getElementById('addrWrap');
const addrEl     = document.getElementById('clientAddress');
const travelNote = document.getElementById('travelNote');

const TZ = 'America/Los_Angeles';
function fmtPT(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: TZ });
}

if (locSel) {
  const syncLocUI = () => {
    const mobile = locSel.value === 'mobile';
    if (addrWrap)   addrWrap.style.display   = mobile ? '' : 'none';
    if (travelNote) travelNote.style.display = mobile ? '' : 'none';
  };
  locSel.addEventListener('change', syncLocUI);
  syncLocUI();
}

if (calEl && timeSel && svcSel && reqBtn && reqMsg) {
  let view = new Date();
  let selectedDateISO = null;

  const ymd = d =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  function renderCalendar() {
    calEl.innerHTML = "";

    const head = document.createElement('div');
    head.className = "cal-head";
    head.innerHTML = `
      <button class="btn secondary" id="prev">&larr;</button>
      <div style="font-weight:700">${view.toLocaleString('default',{month:'long',year:'numeric'})}</div>
      <button class="btn secondary" id="next">&rarr;</button>
    `;
    calEl.appendChild(head);

    const labels = document.createElement('div');
    labels.className = "cal-grid";
    ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(txt => {
      const el = document.createElement('div');
      el.className = "dow";
      el.textContent = txt;
      labels.appendChild(el);
    });
    calEl.appendChild(labels);

    const grid = document.createElement('div');
    grid.className = "cal-grid";

    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const startIdx = first.getDay();
    const daysInMonth = new Date(view.getFullYear(), view.getMonth()+1, 0).getDate();

    for (let i = 0; i < startIdx; i++) {
      const b = document.createElement('div');
      b.className = "day muted";
      grid.appendChild(b);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date  = new Date(view.getFullYear(), view.getMonth(), d);
      const today = new Date(new Date().toDateString());
      const future = date >= today;

      const el = document.createElement('div');
      el.className = "day " + (future ? "ok" : "no");
      if (future) { el.dataset.date = ymd(date); }
      el.textContent = d;

      if (future) {
        el.addEventListener('click', async () => {
          [...grid.querySelectorAll('.day')].forEach(x => x.classList.remove('selected'));
          el.classList.add('selected');
          selectedDateISO = ymd(date);
          await loadTimesFor(selectedDateISO, el);
        });
      } else {
        el.style.cursor = "not-allowed";
      }

      grid.appendChild(el);
    }

    calEl.appendChild(grid);
    document.getElementById('prev').onclick = () => { view.setMonth(view.getMonth()-1); renderCalendar(); };
    document.getElementById('next').onclick = () => { view.setMonth(view.getMonth()+1); renderCalendar(); };

    (async function markMonthAvailability() {
      const cells = grid.querySelectorAll('.day[data-date]');
      for (const cell of cells) {
        const dISO = cell.dataset.date;
        try {
          const url = `/api/freebusy?date=${encodeURIComponent(dISO)}&service=${encodeURIComponent(svcSel.value)}`;
          const resp = await fetch(url);
          const data = await resp.json();
          cell.classList.remove('ok', 'no');
          if (data.fullDayBlocked || !Array.isArray(data.slots) || data.slots.length === 0) {
            cell.classList.add('no');
          } else {
            cell.classList.add('ok');
          }
        } catch(e) {
          cell.classList.remove('ok');
          cell.classList.add('no');
        }
      }
    })();
  }

  async function loadTimesFor(dateISO, dayEl) {
    if (!SERVICE_LABELS.includes(svcSel.value)) svcSel.value = SERVICE_LABELS[0];
    timeSel.innerHTML = '<option value="">Loading…</option>';
    try {
      const url = `/api/freebusy?date=${encodeURIComponent(dateISO)}&service=${encodeURIComponent(svcSel.value)}`;
      const r    = await fetch(url);
      const data = await r.json();
      const slots = Array.isArray(data.slots) ? data.slots : [];
      if (dayEl) {
        dayEl.classList.remove('ok', 'no');
        if (data.fullDayBlocked || slots.length === 0) {
          dayEl.classList.add('no');
        } else {
          dayEl.classList.add('ok');
        }
      }
      timeSel.innerHTML = '<option value="">Select a time</option>';
      if (!slots.length) {
        const o = document.createElement('option');
        o.value = ""; o.textContent = "No times available";
        timeSel.appendChild(o);
        return;
      }
      slots.forEach(iso => {
        const t = fmtPT(iso);
        const o = document.createElement('option');
        o.value = iso; o.textContent = t;
        timeSel.appendChild(o);
      });
    } catch(err) {
      timeSel.innerHTML = '<option value="">Error loading times</option>';
      console.error('freebusy error', err);
    }
  }

  svcSel.addEventListener('change', () => {
    if (selectedDateISO) loadTimesFor(selectedDateISO, calEl.querySelector('.day.selected'));
    renderCalendar();
  });

  reqBtn.addEventListener('click', async () => {
    reqMsg.textContent = "";
    const isoStart       = timeSel.value;
    const service        = svcSel.value;
    const email          = (emailEl.value || "").trim();
    const name           = (nameEl && nameEl.value || "").trim();
    const locationChoice = (locSel && locSel.value) || "studio";
    const clientAddress  = (addrEl && addrEl.value || "").trim();

    if (locationChoice === 'mobile' && !clientAddress) {
      reqMsg.textContent = "Please enter an address for a mobile visit.";
      return;
    }
    if (!selectedDateISO) { reqMsg.textContent = "Please pick a date."; return; }
    if (!isoStart)        { reqMsg.textContent = "Please pick a time."; return; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      reqMsg.textContent = "Enter a valid email."; return;
    }

    reqBtn.disabled = true;
    const old = reqBtn.textContent;
    reqBtn.textContent = "Booking…";

    try {
      const r = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isoStart, service, name, email, location: locationChoice, address: clientAddress })
      });
      const data = await r.json();
      if (data && data.ok) {
        reqMsg.style.color = "#16a34a";
        const svcLabel = service;
        const match    = /\(~\s*(\d+)\s*min\)/i.exec(svcLabel);
        const mins     = match ? parseInt(match[1], 10) : 60;
        const start    = new Date(isoStart);
        const end      = new Date(start.getTime() + mins * 60000);
        const locText  = locationChoice === 'mobile'
          ? `Mobile visit${clientAddress ? ' — ' + clientAddress.replace(/\r?\n/g,' ') : ''}`
          : 'In‑studio';
        const pad    = n => String(n).padStart(2,'0');
        const fmtUTC = d =>
          d.getUTCFullYear() + pad(d.getUTCMonth()+1) + pad(d.getUTCDate()) + 'T' +
          pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
        const uid = Math.random().toString(36).slice(2) + '@revivebylize.com';
        const now = new Date();
        const ics =
`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Revive by Lize//Booking//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${fmtUTC(now)}
DTSTART:${fmtUTC(start)}
DTEND:${fmtUTC(end)}
SUMMARY:${svcLabel.replace(/[\n\r]/g,' ')}
LOCATION:${locText.replace(/[\n\r]/g,' ')}
DESCRIPTION:Booked via revivebylize.com for ${name || 'client'} • ${email}
END:VEVENT
END:VCALENDAR`;
        const blob     = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
        const url      = URL.createObjectURL(blob);
        const whenText = new Date(isoStart).toLocaleString([], { dateStyle:'medium', timeStyle:'short', timeZone: TZ });
        reqMsg.innerHTML = `Booked! <strong>${svcLabel}</strong> on <strong>${whenText}</strong>. <a href="${url}" download="revive-${start.toISOString().slice(0,10)}.ics">Add to Calendar (.ics)</a>`;
      } else {
        reqMsg.style.color = "#ef4444";
        reqMsg.textContent = "Booking failed. Please try again.";
      }
    } catch(err) {
      reqMsg.style.color = "#ef4444";
      reqMsg.textContent = "Network error. Please try again.";
      console.error('book error', err);
    } finally {
      reqBtn.disabled = false;
      reqBtn.textContent = old;
    }
  });

  renderCalendar();
} else {
  console.warn('Booking elements not found; calendar not initialized.');
}

// ── View-more toggles for service cards ────────────────────────────────────
document.querySelectorAll('.view-more').forEach(btn => {
  btn.addEventListener('click', () => {
    const card = btn.closest('.card');
    const more = card && card.querySelector('.more');
    if (!more) return;
    const open = more.style.display !== 'none';
    more.style.display = open ? 'none' : '';
    card.classList.toggle('expanded', !open);
    btn.textContent = open ? 'View more' : 'View less';
  });
});
