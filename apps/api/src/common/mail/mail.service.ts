import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Provider-agnostic outbound mail. Any SMTP-speaking provider (Resend,
 *  SendGrid, Postmark, Mailgun, SES, ...) works here unchanged — set the
 *  SMTP_* env vars and it sends through that provider's relay. With no
 *  SMTP_HOST configured (the default for this scaffold, since no provider has
 *  been chosen yet) it falls back to a "dev mode" transport that just logs
 *  what would have been sent, so every call site below can be wired up now
 *  and start actually sending the moment credentials exist.
 *
 *  Every send() is fire-and-forget from the caller's point of view: failures
 *  are caught and logged here, never thrown, so a broken mail provider can
 *  never block the leave/announcement/employee-update flow that triggered
 *  the notification. */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: nodemailer.Transporter | null;
  private readonly from: string;

  constructor() {
    this.from = process.env.SMTP_FROM || 'tmPro <notifications@tmpro.local>';

    if (process.env.SMTP_HOST) {
      this.transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      });
    } else {
      // Dev-mode: no provider configured yet. Log instead of sending.
      this.transport = null;
    }
  }

  async send(message: MailMessage): Promise<void> {
    if (!message.to) return; // nothing on file to send to — silently skip
    try {
      if (!this.transport) {
        this.logger.log(`[dev-mode email] to=${message.to} subject="${message.subject}"\n${message.text}`);
        return;
      }
      await this.transport.sendMail({ from: this.from, to: message.to, subject: message.subject, text: message.text });
    } catch (err) {
      // Mail is a best-effort side effect — never let a provider outage or
      // bad credentials block the action that triggered the notification.
      this.logger.warn(`Failed to send email to ${message.to}: ${(err as Error).message}`);
    }
  }
}
