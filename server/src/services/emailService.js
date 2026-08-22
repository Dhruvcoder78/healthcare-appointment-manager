const nodemailer = require('nodemailer');

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

// Never throws — callers (background jobs) need a pass/fail signal they can
// act on (retry bookkeeping) without the job crashing.
async function sendMail({ to, subject, text, html }) {
  try {
    await getTransporter().sendMail({ from: process.env.SMTP_FROM, to, subject, text, html });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { sendMail };
