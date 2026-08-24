// Uses Brevo's HTTP API (not SMTP, and not Resend). Two reasons:
//   1. Render (and most PaaS hosts) block outbound SMTP ports (25/465/587)
//      to prevent spam abuse, so Nodemailer/SMTP times out from a deployed
//      server regardless of provider or credentials — only an HTTPS call
//      is unaffected.
//   2. Resend's free tier requires verifying a domain you own before you
//      can send to any recipient other than your own signup address; Brevo
//      only requires verifying a single sender email (no DNS/domain
//      needed) and doesn't restrict which recipients you can send to.
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

// Never throws — callers (background jobs) need a pass/fail signal they can
// act on (retry bookkeeping) without the job crashing.
async function sendMail({ to, subject, text, html }) {
  try {
    const res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: process.env.BREVO_FROM, name: process.env.BREVO_FROM_NAME || 'Healthcare Appointment Manager' },
        to: [{ email: to }],
        subject,
        textContent: text,
        ...(html && { htmlContent: html }),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { success: false, error: `Brevo ${res.status}: ${body}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { sendMail };
