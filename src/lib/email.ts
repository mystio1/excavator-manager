import nodemailer from "nodemailer";

/** Lazily created so a missing SMTP config only breaks the one action that
 * actually needs to send an email, not the whole app at build/boot time. */
let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
      "Email isn't configured yet — set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS in .env",
    );
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465, // 465 = implicit TLS; 587 (the common case) upgrades via STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER!;

  await getTransporter().sendMail({
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
  });
}
