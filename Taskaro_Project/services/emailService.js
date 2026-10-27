const nodemailer = require('nodemailer');
function configured() { return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS); }
async function sendMail({ to, subject, text, html }) {
  if (!configured()) throw new Error('Email is not configured. Add SMTP settings to .env before using email verification.');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return transporter.sendMail({ from: process.env.EMAIL_FROM || process.env.SMTP_USER, to, subject, text, html });
}
module.exports = { sendMail, configured };
