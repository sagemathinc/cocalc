/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { path as ASSETS_DIR } from "@cocalc/assets";
import { Transporter, createTransport } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

import { join } from "node:path";
import { Message } from "./message";
import { getLogger } from "@cocalc/backend/logger";

const L = getLogger("email:send-templates");

// set this environment variable for your own set of templates
const TEMPLATES_ROOT =
  process.env.COCALC_EMAIL_TEMPLATES_ROOT ?? join(ASSETS_DIR, "emails");

L.debug({ TEMPLATES_ROOT });

let templates: EmailTemplateSender | null = null;

export function init(conf: SMTPTransport.Options, settings) {
  templates = new EmailTemplateSender(conf, settings);
}

export async function send({ to, subject }): Promise<any> {
  if (templates == null) {
    throw new Error("email templates not initialized");
  }
  return await templates.send({
    channel: "welcome",
    message: { to, subject },
    locals: {
      name: "Test Name",
      siteName: "CoCalc",
    },
  });
}

interface EmailTemplateSendConfig {
  channel: string;
  message: { to: string; subject: string; name?: string };
  locals: Record<string, string>;
}

class EmailTemplateSender {
  private mailer: Transporter;
  private from: string; // email address
  private name: string; // sender's name
  private dns: string; // domain name

  constructor(
    conf: SMTPTransport.Options,
    settings: { from: string; name: string; dns: string }
  ) {
    this.mailer = createTransport({ ...conf, pool: true });
    this.from = settings.from;
    this.name = settings.name;
    this.dns = settings.dns;
  }

  public async send(conf: EmailTemplateSendConfig): Promise<any> {
    const { channel, message, locals } = conf;

    const html = `render ${channel} with ${JSON.stringify(locals)}}`;
    const text = html;

    const msg: Message & { list: any } = {
      from: `"${this.name}" <${this.from}>`,
      to: `${message.name ?? ""} <${message.to}>`,
      subject: message.subject,
      html,
      text,
      list: {
        unsubscribe: {
          url: `https://${this.dns}/email/unsubscribe?channel=${channel}&email=${message.to}`,
          comment: "Unsubscribe from this channel",
        },
      },
    };

    try {
      const status = await this.mailer.sendMail(msg);
      L.debug("success sending email:", status);
    } catch (err) {
      L.warn("error sending email:", err);
    }
  }
}
