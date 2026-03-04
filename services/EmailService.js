import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = "StockFX <no-reply@karteq.com.ng>"; // Replace with your domain in prod

export const sendEmail = async ({ to, subject, html }) => {
  if (!resend) {
    console.log(
      `[DEV] Email suppressed (no API key). To: ${to}, Subject: ${subject}`,
    );
    return;
  }
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error("Resend error:", err);
  }
};

export const EmailService = {
  async sendOTP(email, otp) {
    return sendEmail({
      to: email,
      subject: "Your StockFX Verification Code",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
          <h2 style="color: #10b981;">Verification Code</h2>
          <p>Your verification code for StockFX is:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #0f172a; padding: 20px; background: #f8fafc; border-radius: 8px; text-align: center;">
            ${otp}
          </div>
          <p style="color: #64748b; font-size: 14px; margin-top: 20px;">
            This code will expire in 10 minutes. If you didn't request this, please ignore this email.
          </p>
        </div>
      `,
    });
  },

  async sendWelcome(email, name) {
    return sendEmail({
      to: email,
      subject: "Welcome to StockFX!",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
          <h1 style="color: #10b981;">Welcome to StockFX, ${name}!</h1>
          <p>We're excited to have you on board. Your account has been successfully created.</p>
          <p>You can now start investing and tracking your portfolio with ease.</p>
        </div>
      `,
    });
  },

  async sendVerificationToken(email, token) {
    return sendEmail({
      to: email,
      subject: "Verify Your StockFX Account",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
          <h2 style="color: #10b981;">Account Verification</h2>
          <p>Please enter the following 6-digit code on the verification page to activate your account:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #0f172a; padding: 20px; background: #f8fafc; border-radius: 8px; text-align: center; margin: 20px 0;">
            ${token}
          </div>
          <p style="color: #64748b; font-size: 14px;">If you didn't request this, please ignore this email.</p>
        </div>
      `,
    });
  },

  async sendBalanceUpdate(email, name, balance) {
    return sendEmail({
      to: email,
      subject: "Your Account Balance Has Been Updated",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
          <h2 style="color: #10b981;">Balance Update Notification</h2>
          <p>Hello ${name || "User"},</p>
          <p>Your account balance has been updated to:</p>
          <div style="font-size: 24px; font-weight: bold; color: #0f172a; padding: 20px; background: #f8fafc; border-radius: 8px; text-align: center;">
            $${balance.toLocaleString()}
          </div>
        </div>
      `,
    });
  },

  async sendNewDeviceAlert(email, info) {
    return sendEmail({
      to: email,
      subject: "New Device Login - StockFX",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
          <h2 style="color: #0f172a;">New Login Detected</h2>
          <p>Your StockFX account was just accessed from a new device:</p>
          <ul style="background: #f8fafc; padding: 20px; border-radius: 8px; list-style: none;">
            <li><strong>Device:</strong> ${info.deviceName || "Unknown"}</li>
            <li><strong>OS:</strong> ${info.os || "Unknown"}</li>
            <li><strong>Browser:</strong> ${info.browser || "Unknown"}</li>
            <li><strong>IP:</strong> ${info.ip}</li>
          </ul>
        </div>
      `,
    });
  },
  async sendDepositAlert(email, name, amount) {
    return sendEmail({
      to: email,
      subject: "Deposit Approved - StockFX",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
          <h2 style="color: #10b981;">Deposit Successful</h2>
          <p>Hello ${name || "User"},</p>
          <p>Your deposit of <strong>$${amount.toLocaleString()}</strong> has been approved and credited to your account.</p>
        </div>
      `,
    });
  },
  async sendDebitAlert(email, name, amount) {
    return sendEmail({
      to: email,
      subject: "Transaction Successful - StockFX",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
          <h2 style="color: #ef4444;">Debit Alert</h2>
          <p>Hello ${name || "User"},</p>
          <p>Your withdrawal/transfer of <strong>$${amount.toLocaleString()}</strong> has been approved and processed.</p>
        </div>
      `,
    });
  },

  async sendAdminNotification(email, name, message) {
    return sendEmail({
      to: email,
      subject: "Important Message from Admin - StockFX",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
          <h2 style="color: #0f172a;">Message from System Administrator</h2>
          <p>Hello ${name || "User"},</p>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #10b981; margin: 20px 0;">
            ${message}
          </div>
        </div>
      `,
    });
  },
};
