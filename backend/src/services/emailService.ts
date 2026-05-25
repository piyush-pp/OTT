import nodemailer from "nodemailer";
import { env } from "../utils/env.js";

function createTransport() {
  if (env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
    });
  }
  return null;
}

const transport = createTransport();

export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  if (!transport) {
    // Dev fallback: log to console instead of sending
    console.log(
      `\n[EMAIL - DEV MODE - configure SMTP_HOST to send real emails]\nTo: ${params.to}\nSubject: ${params.subject}\n\n${params.text}\n`
    );
    return;
  }
  await transport.sendMail({
    from: env.SMTP_FROM,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html
  });
}
