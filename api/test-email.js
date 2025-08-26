// /api/test-email.js
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  try {
    const to = (req.query.to || process.env.OWNER_EMAIL || process.env.FROM_EMAIL || process.env.SMTP_USER);
    // Basic config sanity
    const cfg = {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      logger: !!process.env.SMTP_DEBUG,
      debug:  !!process.env.SMTP_DEBUG,
    };
    const transporter = nodemailer.createTransport(cfg);
    const from = process.env.FROM_EMAIL || process.env.SMTP_USER;

    // Verify connection/auth first
    await transporter.verify();

    const info = await transporter.sendMail({
      from,
      to,
      subject: 'Revive by Lize — SMTP test',
      text: 'If you can read this, SMTP is working from Vercel.',
    });

    res.json({ ok: true, messageId: info.messageId });
  } catch (err) {
    console.error('SMTP TEST ERROR:', {
      code: err?.code,
      responseCode: err?.responseCode,
      command: err?.command,
      message: err?.message,
      response: err?.response,
    });
    res.status(500).json({ ok: false, error: err?.message, code: err?.code, rc: err?.responseCode });
  }
}
