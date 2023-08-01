/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import stableJson from "json-stable-stringify";
import type { Transporter } from "nodemailer";
import { createTransport } from "nodemailer";

import type { Message } from "./message";
import { getConf, getSMTPSettings } from "./smtp-config";
import {
  initSendingTemplates,
  enqueue as queueTemplate,
  send as sendTemplate,
} from "./templates";
import {
  EmailTemplateName,
  EmailTemplateSendResult,
  SMTPSettings,
} from "./types";

export default async function sendEmail(message: Message): Promise<void> {
  let settings: SMTPSettings;
  try {
    settings = await getSMTPSettings();
  } catch (err) {
    throw Error(
      `SMTP is not properly configured for this server. Contact the site administrator. -- ${err}`
    );
  }

  if (!message.from) {
    message.from = settings.from;
  }

  const server = await getServer(settings);
  //const msg = await appendFooter(message);
  await server.sendMail(message);
}

interface TemplateEmailOpts {
  to: string; // recipient email
  subject?: string;
  name?: string; // recipient name
  template: EmailTemplateName;
  locals: Record<string, string | number>;
  test?: boolean;
  priority?: number; // higher, the better. 0 neutral. -1 is queued.
}

export async function sendTemplateEmail(
  message: TemplateEmailOpts
): Promise<EmailTemplateSendResult | null> {
  await initSendingTemplates();

  const { priority = 0 } = message;
  if (priority < 0) {
    return await queueTemplate(message);
  } else {
    return await sendTemplate(message);
  }
}

let server: undefined | Transporter = undefined;
let cacheSettings = ""; // what settings were used to compute cached server.
async function getServer(settings): Promise<{ sendMail: (Message) => any }> {
  const s = stableJson(settings);
  if (server !== undefined && s == cacheSettings) return server;
  // https://nodemailer.com/smtp/pooled/ -- missing in @types/nodemailer
  const conf = getConf(settings);
  server = await createTransport(conf);
  cacheSettings = s;
  return server;
}
