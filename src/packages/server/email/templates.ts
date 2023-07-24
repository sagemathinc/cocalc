/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { path as ASSETS_DIR } from "@cocalc/assets";
import { compile as html2textCompile } from "html-to-text";
import juice from "juice";
import MarkdownIt from "markdown-it";
import Mustache from "mustache";
import { Transporter, createTransport } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { minify as htmlMinify } from "html-minifier-terser";

import { getLogger } from "@cocalc/backend/logger";
import { join } from "node:path";
import { Message } from "./message";
import {
  EMAIL_ELEMENTS,
  EMAIL_TEMPLATES,
  EmailTemplateName,
  RESET_CSS,
} from "./templates-data";

const L = getLogger("email:send-templates");

// set this environment variable for your own set of templates
const TEMPLATES_ROOT =
  process.env.COCALC_EMAIL_TEMPLATES_ROOT ?? join(ASSETS_DIR, "emails");

L.debug({ TEMPLATES_ROOT });

let templateSender: EmailTemplateSender | null = null;

export function init(
  conf: SMTPTransport.Options,
  settings: EmailTemplateSenderSettings
) {
  if (templateSender != null) {
    L.debug("email templates already initialized");
    return;
  }
  templateSender = new EmailTemplateSender(conf, settings);
}

interface Send {
  to: string;
  subject: string;
  template: EmailTemplateName;
  test?: boolean;
}

export async function send({
  to,
  subject,
  test = false,
  template,
}: Send): Promise<any> {
  if (templateSender == null) {
    throw new Error("email templates not initialized");
  }
  return await templateSender.send({
    test,
    template,
    message: { to, subject },
    locals: {
      name: "Test Name",
      siteName: "CoCalc",
    },
  });
}

interface EmailTemplateSendConfig {
  template: EmailTemplateName;
  message: { to: string; subject: string; name?: string };
  locals: Partial<EmailTemplateSenderSettings> & Record<string, string>;
  test?: boolean;
}

interface EmailTemplateSenderSettings {
  fromEmail: string;
  fromName: string;
  dns: string;
  siteName: string;
  logoSquare: string;
}

export interface EmailTemplateSendResult {
  status: "sent" | "test" | "error";
  value: any;
}

class EmailTemplateSender {
  private mailer: Transporter;
  private html2text = html2textCompile({ wordwrap: 130 });
  private md = new MarkdownIt();
  private settings: EmailTemplateSenderSettings;

  constructor(
    conf: SMTPTransport.Options,
    settings: EmailTemplateSenderSettings
  ) {
    this.mailer = createTransport({ ...conf, pool: true });
    this.settings = { ...settings };
  }

  public async send({
    template,
    message,
    locals,
    test = false,
  }: EmailTemplateSendConfig): Promise<EmailTemplateSendResult> {
    const vars = {
      ...this.settings,
      date: new Date().toISOString(),
      ...locals,
    };

    const templateData = EMAIL_TEMPLATES[template];
    const subject = Mustache.render(message.subject, vars);

    // try {
      const css = `<style>${RESET_CSS}</style>`;
      const bodyRendered = this.md.render(
        Mustache.render(templateData.template, vars)
      );
      const body = `<div class="body">${bodyRendered}</div>`;
      const header = Mustache.render(EMAIL_ELEMENTS.header, vars);
      const footer = Mustache.render(EMAIL_ELEMENTS.footer, vars);
      const email = `${css}${header}${body}${footer}`;

      const html = await htmlMinify(juice(email), {
        minifyCSS: true,
        collapseWhitespace: true,
      });

      const msg: Message & { list: any } = {
        from: `"${vars.fromName}" <${vars.fromEmail}>`,
        to: `${message.to ?? ""} <${message.to}>`,
        subject,
        html,
        text: this.html2text(html),
        list: {
          unsubscribe: {
            url: `https://${vars.dns}/email/unsubscribe?channel=${template}&email=${message.to}`,
            comment: `Unsubscribe from "${template}" emails`,
          },
        },
      };

      if (test) {
        return { status: "test", value: msg };
      } else {
        try {
          const status = await this.mailer.sendMail(msg);
          L.debug("success sending email:", status);
          return { status: "sent", value: status };
        } catch (err) {
          L.warn("error sending email:", err);
          return { status: "error", value: err };
        }
      }
    // } catch (err) {
    //   L.error("error htmlMinify:", err);
    //   throw err;
    //   return { status: "error", value: err };
    // }
  }
}
