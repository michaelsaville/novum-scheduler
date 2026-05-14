/**
 * Resend SMTP wrapper. Per the standard PCC2K config in
 * `reference_resend_smtp_config.md`:
 *   SMTP_HOST=smtp.resend.com
 *   port 465 secure
 *   USER literally `resend`
 *   PASS is the API key
 *
 * Reads RESEND_API_KEY + RESEND_FROM from env. When either is missing,
 * sendMail logs and short-circuits — never throws — so dev / test /
 * pre-DNS-verified deploys behave the same as the unconfigured baseline.
 * Activation requires:
 *   1. Verify novum.pcc2k.com (or the chosen sender domain) in the
 *      Resend dashboard.
 *   2. Add the three DNS records Resend prints (MX send., TXT SPF
 *      send., TXT DKIM resend._domainkey.) — single SPF; merge into
 *      any existing record per the memory.
 *   3. Set RESEND_API_KEY + RESEND_FROM in app/.env, restart.
 */

import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  transporter = nodemailer.createTransport({
    host: 'smtp.resend.com',
    port: 465,
    secure: true,
    auth: { user: 'resend', pass: apiKey },
  });
  return transporter;
}

export type SendMailArgs = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /// Plain-text reply-to override. Defaults to RESEND_FROM.
  replyTo?: string;
};

export async function sendMail(args: SendMailArgs): Promise<{ ok: boolean; error?: string }> {
  const from = process.env.RESEND_FROM;
  if (!from) {
    console.warn('[email] RESEND_FROM not configured — short-circuit', { to: args.to });
    return { ok: false, error: 'RESEND_FROM not set' };
  }
  const tx = getTransporter();
  if (!tx) {
    console.warn('[email] RESEND_API_KEY not configured — short-circuit', { to: args.to });
    return { ok: false, error: 'RESEND_API_KEY not set' };
  }
  try {
    await tx.sendMail({
      from,
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html,
      replyTo: args.replyTo ?? from,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    console.error('[email] sendMail failed', { to: args.to, subject: args.subject, error: msg });
    return { ok: false, error: msg };
  }
}
