// backend/src/utils/email.js - transactional email via Resend
const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function sendPasswordResetEmail(email, rawToken) {
  const resetUrl = `${process.env.FRONTEND_URL || 'https://yourapp.com'}/reset-password?token=${rawToken}`;

  if (!resend) {
    // No provider configured (local dev) - log instead of failing the request.
    console.warn(`⚠️  RESEND_API_KEY not set - password reset link for ${email}: ${resetUrl}`);
    return;
  }

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'DRPN <onboarding@resend.dev>',
    to: email,
    subject: 'Reset your DRPN password',
    html: `
      <p>Someone requested a password reset for this account.</p>
      <p><a href="${resetUrl}">Click here to reset your password</a>. This link expires in 1 hour.</p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `
  });
}

module.exports = { sendPasswordResetEmail };
