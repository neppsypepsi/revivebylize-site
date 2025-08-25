import { google } from 'googleapis';

const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL, null,
  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/calendar']
);
const calendar = google.calendar({ version:'v3', auth });
const TZ = process.env.TIMEZONE || 'America/Los_Angeles';

// business hours per weekday [startMin, endMin]
const HOURS = {0:[12*60,18*60],1:[17*60,21*60],2:[17*60,21*60],3:[0,0],4:[17*60,21*60],5:[0,0],6:[10*60,16*60]};
const DUR = {'Gentle Recovery Flow (60 min)':60,'Total Body Renewal (60 min)':60,'Radiance Facial Flow (45 min)':45};
const PRE = 15, POST = 15, STEP = 15;

export default async function handler(req,res){
  try{
    const { date, service } = req.query;
    if(!date) return res.status(400).json({error:'date required'});
    const need = (DUR[service]||60) + PRE + POST;

    const d = new Date(date);
    const dow = d.getDay();
    const [startMin,endMin] = HOURS[dow]||[0,0];
    if(startMin>=endMin) return res.json({slots:[]});

    const start = new Date(d.setHours(0,0,0,0));
    const end = new Date(new Date(start).setHours(23,59,59,999));
    const fb = await calendar.freebusy.query({requestBody:{
      timeMin:start.toISOString(), timeMax:end.toISOString(), timeZone:TZ,
      items:[{id:process.env.CALENDAR_ID}]
    }});
    const busy = (fb.data.calendars[process.env.CALENDAR_ID]?.busy||[])
      .map(b=>[+new Date(b.start), +new Date(b.end)]);

    const windowStart = +start + startMin*60000, windowEnd = +start + endMin*60000;
    const now = Date.now(), out = [];

    for(let t=windowStart; t + need*60000 <= windowEnd; t += STEP*60000){
      if(t < now) continue;
      const slotStart = t + PRE*60000;
      const slotEnd = slotStart + (DUR[service]||60)*60000;
      const totalStart = t, totalEnd = slotEnd + POST*60000;
      const conflict = busy.some(([bS,bE]) => !(totalEnd<=bS || totalStart>=bE));
      if(!conflict) out.push(new Date(slotStart).toISOString());
    }
    res.json({slots:out});
  }catch(e){ console.error(e); res.status(500).json({error:'freebusy failed'}); }
}
