// Uses Resend's HTTP API (not SMTP). Render's web services block outbound
// SMTP ports (25/465/587) to prevent spam abuse, so a raw SMTP transport —
// Gmail or any other provider's — times out from a Render-hosted server no
// matter how it's configured. An HTTPS API call is unaffected, since only
// SMTP ports are blocked, not port 443.
const RESEND_API_URL = 'https://api.resend.com/emails';

// Never throws — callers (background jobs) need a pass/fail signal they can
// act on (retry bookkeeping) without the job crashing.
async function sendMail({ to, subject, text, html }) {
  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM,
        to,
        subject,
        text,
        ...(html && { html }),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { success: false, error: `Resend ${res.status}: ${body}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { sendMail };
