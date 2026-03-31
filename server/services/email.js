// ================================================
// EMAIL SERVICE — Sends transactional emails via SMTP
// Configure SMTP_* env vars in .env
// ================================================
const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || '"MDGA" <noreply@mdga.dev>';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('[Email] SMTP not configured — emails disabled (host:', SMTP_HOST, 'user:', SMTP_USER, 'pass:', SMTP_PASS ? '***' : 'MISSING', ')');
    return null;
  }
  console.log(`[Email] Creating transporter: ${SMTP_HOST}:${SMTP_PORT} (user: ${SMTP_USER}, secure: ${SMTP_PORT === 465})`);
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

async function sendEmail(to, subject, html) {
  const t = getTransporter();
  if (!t) return false;
  try {
    await t.sendMail({ from: SMTP_FROM, to, subject, html });
    console.log(`[Email] Sent "${subject}" to ${to}`);
    return true;
  } catch (err) {
    console.error(`[Email] Failed to send to ${to}:`, err.message);
    return false;
  }
}

const DISCORD_INVITE = process.env.DISCORD_INVITE_URL || 'https://discord.gg/wowmdga';

async function sendApprovalEmail(email, displayName) {
  console.log(`[Email] sendApprovalEmail called — to: ${email || 'NULL'}, name: ${displayName}`);
  if (!email) return false;
  return sendEmail(
    email,
    'Your MDGA Account Has Been Approved!',
    `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #e0e0e0; padding: 32px; border-radius: 8px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #B91C1C; margin: 0; font-size: 28px;">MDGA</h1>
        <p style="color: #888; margin: 4px 0 0;">Make Durotar Great Again</p>
      </div>
      <h2 style="color: #34D399; margin-bottom: 16px;">Welcome aboard, ${displayName || 'warrior'}!</h2>
      <p style="line-height: 1.6;">Your account has been approved by our officers. You're officially part of the warband.</p>
      <p style="line-height: 1.6;"><strong>Next step:</strong> Join our Discord server to connect with the guild.</p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${DISCORD_INVITE}" style="display: inline-block; background: #5865F2; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Join MDGA Discord</a>
      </div>
      <p style="line-height: 1.6;">Once you've joined Discord, log in at <a href="https://mdga.dev" style="color: #F5C518;">mdga.dev</a> to access the full site.</p>
      <hr style="border: none; border-top: 1px solid #333; margin: 24px 0;">
      <p style="color: #666; font-size: 12px; text-align: center;">You received this because you signed up at mdga.dev. If this wasn't you, ignore this email.</p>
    </div>
    `
  );
}

module.exports = { sendEmail, sendApprovalEmail, DISCORD_INVITE };
