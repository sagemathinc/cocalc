/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { path as ASSETS_DIR } from "@cocalc/assets";
import { minify as htmlMinify } from "html-minifier-terser";
import { compile as html2textCompile } from "html-to-text";
import juice from "juice";
import MarkdownIt from "markdown-it";
import Mustache from "mustache";
import { Transporter, createTransport } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

import { getLogger } from "@cocalc/backend/logger";
import { join } from "node:path";
import { Message } from "./message";
import {
  EMAIL_CSS,
  EMAIL_ELEMENTS,
  EMAIL_TEMPLATES,
  EmailTemplateName,
} from "./templates-data";

const L = getLogger("email:send-templates");

// set this environment variable for your own set of templates
const TEMPLATES_ROOT =
  process.env.COCALC_EMAIL_TEMPLATES_ROOT ?? join(ASSETS_DIR, "emails");

L.debug({ TEMPLATES_ROOT });

let templateSender: EmailTemplateSender | null = null;

export function init(
  conf: SMTPTransport.Options,
  settings: EmailTemplateSenderSettings,
  reset = false
) {
  if (!reset && templateSender != null) {
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
  locals: Record<string, string>;
}

export async function send({
  to,
  subject,
  test = false,
  template,
  locals,
}: Send): Promise<any> {
  if (templateSender == null) {
    throw new Error("email templates not initialized");
  }
  return await templateSender.send({
    test,
    template,
    message: { to, subject },
    locals,
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
  siteURL: string; // http[s]://<domain>[/basePath]"
  siteName: string;
  logoSquare: string;
  helpEmail: string;
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
      email_addess: message.to,
    };

    const templateData = EMAIL_TEMPLATES[template];
    const subjectLine = Mustache.render(message.subject, vars);
    const subject = `[${vars.siteName}] ${subjectLine}`;

    const bodyRendered = this.md.render(
      Mustache.render(templateData.template, vars)
    );
    const body = `<div class="body">${bodyRendered}</div>`;
    const header = Mustache.render(EMAIL_ELEMENTS.header, vars);
    const footerTmpl =
      EMAIL_TEMPLATES[template].unsubscribe ?? true
        ? EMAIL_ELEMENTS.footerUnsubscribe
        : EMAIL_ELEMENTS.footerTransactional;
    const footer = Mustache.render(footerTmpl, vars);
    const email = wrapEmail(`${header}${body}${footer}`);

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
  }
}

/**
 * Wrap the HTML content of the Email in a table with a max-width of 600px.
 * 600px is somehow the general standard for emails.
 */
function wrapEmail(html: string): string {
  const css = `<style>${EMAIL_CSS}</style>`;
  return `${css}
  <table style="width:100%; max-width: 600px; margin: 0 auto;" cellpadding="0" cellspacing="0" border="0">
  <tr>
  <td width="100%" style="text-align:left;">${html}</td>
  </tr>
  </table>`;
}
