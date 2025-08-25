import { google } from 'googleapis';

const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL, null,
  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n'),
  ['https://www.googleapis.com/auth/calendar']
);
const calendar = google.calendar({ version:'v3', auth });
const TZ = process.env.TIMEZONE || 'America/Los_Angeles';

const DUR = {
  'Gentle Recovery Flow (60 min)': 60,
  'Total Body Renewal (60 min)': 60,
  'Radiance Facial Flow (45 min)': 45
};

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).end();
  try{
    const { isoStart, service, name, email } = req.body || {};
    if(!isoStart || !service || !email) return res.status(400).json({error:'missing fields'});

    const start = new Date(isoStart);
    const end = new Date(+start + (DUR[service]||60)*60000);

    const ev = await calendar.events.insert({
      calendarId: process.env.CALENDAR_ID,
      sendUpdates: 'all',
      requestBody:{
        summary: `${service} — Revive by Lize`,
        description: `Client: ${name||'Guest'}\nService: ${service}\nContact: ${email}\nPolicy: 24h reschedule; $25 late-cancel via Zelle.`,
        start:{dateTime:start.toISOString(), timeZone:TZ},
        end:{dateTime:end.toISOString(), timeZone:TZ},
        attendees:[{email}],
        reminders:{useDefault:true}, visibility:'private'
      }
    });

    res.json({ok:true,id:ev.data.id});
  }catch(e){ console.error(e); res.status(500).json({error:'booking failed'}); }
}
