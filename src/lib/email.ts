/**
 * Resend instead of raw SMTP — Gmail's SMTP relay silently stalls
 * connections from cloud-hosting IPs (Render included) as an anti-spam
 * measure, no clean refusal, just a multi-minute hang until nodemailer's
 * own connection timeout finally gave up. A plain HTTPS API call has none
 * of that — same request/response shape as any other fetch this app makes.
 */
const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error("Email isn't configured yet — set RESEND_API_KEY and RESEND_FROM_EMAIL in .env");
  }

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: "Reset your Excavator Manager password",
      text: `We received a request to reset your password.\n\nReset it here (valid for 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email — your password won't change.`,
      html: `
        <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #17212b;">
          <div style="background: linear-gradient(90deg, #f4a910, #f6b51e); padding: 20px 24px; border-radius: 12px 12px 0 0;">
            <span style="font-size: 18px; font-weight: 800; color: #1a1207;">Excavator Manager</span>
          </div>
          <div style="border: 1px solid #eee; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
            <p style="font-size: 16px;">We received a request to reset your password.</p>
            <p>
              <a href="${resetUrl}" style="display: inline-block; background: #f4a910; color: #1a1207; font-weight: 700; text-decoration: none; padding: 12px 24px; border-radius: 10px; margin: 8px 0;">
                Reset Password
              </a>
            </p>
            <p style="color: #687385; font-size: 13px;">This link is valid for 1 hour. If you didn't request this, you can safely ignore this email — your password won't change.</p>
          </div>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
}
