import { Resend } from "resend";
import config from "../config.js";
import { escapeHtml, formatMoney } from "../utils/validate.js";

const resend = config.resendApiKey ? new Resend(config.resendApiKey) : null;

if (!resend) {
  console.warn(
    "[EMAIL] RESEND_API_KEY is not set - emails will be logged instead of sent.",
  );
}

const layout = (body) => `
  <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 600px; margin: auto; color: #0f172a;">
    ${body}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0 16px" />
    <p style="color:#94a3b8;font-size:12px">
      StockFX Investment &middot; This is an automated message, please do not reply.
    </p>
  </div>
`;

const codeBlock = (code) => `
  <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #0f172a; padding: 20px; background: #f8fafc; border-radius: 8px; text-align: center; margin: 20px 0;">
    ${escapeHtml(code)}
  </div>
`;

/**
 * Sends an email. Returns `{ sent: boolean }` and never throws, so a mail
 * outage cannot break registration - but delivery failures are surfaced to
 * callers that care (e.g. OTP delivery).
 */
export const sendEmail = async ({ to, subject, html }) => {
  if (!resend) {
    console.log(`[EMAIL:DEV] to=${to} subject="${subject}"`);
    return { sent: false, reason: "no-api-key" };
  }
  try {
    const { error } = await resend.emails.send({
      from: config.emailFrom,
      to,
      subject,
      html,
    });
    if (error) {
      console.error("[EMAIL] Resend rejected the message:", error);
      return { sent: false, reason: error.message || "rejected" };
    }
    return { sent: true };
  } catch (err) {
    console.error("[EMAIL] Resend request failed:", err?.message || err);
    return { sent: false, reason: "request-failed" };
  }
};

export const EmailService = {
  /** Sign-up confirmation code. */
  async sendSignupOtp(email, code, name) {
    return sendEmail({
      to: email,
      subject: "Confirm your StockFX account",
      html: layout(`
        <h2 style="color:#10b981;margin-bottom:8px">Confirm your email</h2>
        <p>Hi ${escapeHtml(name || "there")}, welcome to StockFX.</p>
        <p>Enter this 6-digit code to activate your account:</p>
        ${codeBlock(code)}
        <p style="color:#64748b;font-size:14px">
          The code expires in ${config.otp.ttlMinutes} minutes. If you did not create
          an account, you can safely ignore this email.
        </p>
      `),
    });
  },

  /** Generic verification code (resend / login re-verification). */
  async sendOTP(email, code) {
    return sendEmail({
      to: email,
      subject: "Your StockFX verification code",
      html: layout(`
        <h2 style="color:#10b981;margin-bottom:8px">Verification code</h2>
        <p>Your StockFX verification code is:</p>
        ${codeBlock(code)}
        <p style="color:#64748b;font-size:14px">
          The code expires in ${config.otp.ttlMinutes} minutes. If you did not request
          it, please ignore this email.
        </p>
      `),
    });
  },

  async sendWelcome(email, name) {
    return sendEmail({
      to: email,
      subject: "Welcome to StockFX!",
      html: layout(`
        <h1 style="color:#10b981">Welcome, ${escapeHtml(name || "investor")}!</h1>
        <p>Your account is verified and ready to use.</p>
        <p>You can now fund your account, track your portfolio, and follow your returns.</p>
      `),
    });
  },

  async sendBalanceUpdate(email, name, balance) {
    return sendEmail({
      to: email,
      subject: "Your account balance has been updated",
      html: layout(`
        <h2 style="color:#10b981">Balance update</h2>
        <p>Hello ${escapeHtml(name || "User")},</p>
        <p>Your account balance is now:</p>
        <div style="font-size:24px;font-weight:bold;padding:20px;background:#f8fafc;border-radius:8px;text-align:center">
          $${formatMoney(balance)}
        </div>
      `),
    });
  },

  async sendStatsUpdate(email, name, changes) {
    const rows = changes
      .map(
        (c) => `
        <tr>
          <td style="padding:8px 0;color:#64748b">${escapeHtml(c.label)}</td>
          <td style="padding:8px 0;text-align:right;font-weight:bold">${escapeHtml(c.value)}</td>
        </tr>`,
      )
      .join("");

    return sendEmail({
      to: email,
      subject: "Your StockFX account was updated",
      html: layout(`
        <h2 style="color:#10b981">Account update</h2>
        <p>Hello ${escapeHtml(name || "User")},</p>
        <p>The following details on your account were updated:</p>
        <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;padding:16px">
          ${rows}
        </table>
      `),
    });
  },

  async sendNewDeviceAlert(email, info = {}) {
    return sendEmail({
      to: email,
      subject: "New device login - StockFX",
      html: layout(`
        <h2>New login detected</h2>
        <p>Your StockFX account was accessed from a new device:</p>
        <ul style="background:#f8fafc;padding:20px;border-radius:8px;list-style:none">
          <li><strong>Device:</strong> ${escapeHtml(info.deviceName || "Unknown")}</li>
          <li><strong>OS:</strong> ${escapeHtml(info.os || "Unknown")}</li>
          <li><strong>Browser:</strong> ${escapeHtml(info.browser || "Unknown")}</li>
          <li><strong>IP:</strong> ${escapeHtml(info.ip || "Unknown")}</li>
        </ul>
        <p style="color:#64748b;font-size:14px">
          If this was not you, change your password and sign out of all devices.
        </p>
      `),
    });
  },

  async sendDepositAlert(email, name, amount) {
    return sendEmail({
      to: email,
      subject: "Deposit approved - StockFX",
      html: layout(`
        <h2 style="color:#10b981">Deposit successful</h2>
        <p>Hello ${escapeHtml(name || "User")},</p>
        <p>Your deposit of <strong>$${formatMoney(amount)}</strong> has been approved
        and credited to your account.</p>
      `),
    });
  },

  async sendDebitAlert(email, name, amount) {
    return sendEmail({
      to: email,
      subject: "Transaction approved - StockFX",
      html: layout(`
        <h2 style="color:#ef4444">Debit alert</h2>
        <p>Hello ${escapeHtml(name || "User")},</p>
        <p>Your withdrawal/transfer of <strong>$${formatMoney(amount)}</strong> has been
        approved and processed.</p>
      `),
    });
  },

  async sendTransactionRejected(email, name, type, amount) {
    return sendEmail({
      to: email,
      subject: "Transaction declined - StockFX",
      html: layout(`
        <h2 style="color:#ef4444">Request declined</h2>
        <p>Hello ${escapeHtml(name || "User")},</p>
        <p>Your ${escapeHtml(type)} request for <strong>$${formatMoney(amount)}</strong>
        was declined. Contact support if you believe this is an error.</p>
      `),
    });
  },

  async sendAdminNotification(email, name, message) {
    return sendEmail({
      to: email,
      subject: "Important message from StockFX",
      html: layout(`
        <h2>Message from the StockFX team</h2>
        <p>Hello ${escapeHtml(name || "User")},</p>
        <div style="background:#f8fafc;padding:20px;border-radius:8px;border-left:4px solid #10b981;margin:20px 0;white-space:pre-wrap">
          ${escapeHtml(message)}
        </div>
      `),
    });
  },
};

export default EmailService;
