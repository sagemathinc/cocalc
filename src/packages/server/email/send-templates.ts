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

const L = getLogger("email:send-templates");

// set this environment variable for your own set of templates
const TEMPLATES_ROOT =
  process.env.COCALC_EMAIL_TEMPLATES_ROOT ?? join(ASSETS_DIR, "emails");

L.debug({ TEMPLATES_ROOT });

let templates: EmailTemplateSender | null = null;

export function init(
  conf: SMTPTransport.Options,
  settings: EmailTemplateSenderSettings
) {
  if (templates != null) {
    L.debug("email templates already initialized");
    return;
  }
  templates = new EmailTemplateSender(conf, settings);
}

export async function send({ to, subject, test = false }): Promise<any> {
  if (templates == null) {
    throw new Error("email templates not initialized");
  }
  return await templates.send({
    test,
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
  test?: boolean;
}

interface EmailTemplateSenderSettings {
  from: string;
  name: string;
  dns: string;
  siteName: string;
}

export interface EmailTemplateSendResult {
  status: "sent" | "test" | "error";
  value: any;
}

const template = `
## Hello {{name}}!

Welcome to {{siteName}}. We're excited to have you on board.
`;

// based on https://meyerweb.com/eric/tools/css/reset/ and juice will inline it for html emails
const resetCSS = `
html, body, div, span, applet, object, iframe, h1, h2, h3, h4, h5, h6, p, blockquote, pre,
a, abbr, acronym, address, big, cite, code, del, dfn, em, img, ins, kbd, q, s, samp,
small, strike, strong, sub, sup, tt, var, b, u, i, center,
dl, dt, dd, ol, ul, li, fieldset, form, label, legend, table, caption, tbody, tfoot, thead, tr, th, td,
article, aside, canvas, details, embed, figure, figcaption, footer, header, hgroup,
menu, nav, output, ruby, section, summary, time, mark, audio, video {
	margin: 0;
	padding: 0;
	border: 0;
	font-size: 100%;
	font: sans-serif;
	vertical-align: baseline;
}
article, aside, details, figcaption, figure, footer, header, hgroup, menu, nav, section {
	display: block;
}
body {
	line-height: 1;
}
ol, ul {
	list-style: none;
}
blockquote, q {
	quotes: none;
}
blockquote:before, blockquote:after,
q:before, q:after {
	content: '';
	content: none;
}
table {
	border-collapse: collapse;
	border-spacing: 0;
}`;

class EmailTemplateSender {
  private mailer: Transporter;
  private from: string; // email address
  private name: string; // sender's name
  private dns: string; // domain name
  private html2text = html2textCompile({ wordwrap: 130 });
  private md = new MarkdownIt();
  private globals: { siteName: string };

  constructor(
    conf: SMTPTransport.Options,
    settings: EmailTemplateSenderSettings
  ) {
    this.mailer = createTransport({ ...conf, pool: true });
    this.from = settings.from;
    this.name = settings.name;
    this.dns = settings.dns;
    this.globals = { siteName: settings.siteName };
  }

  public async send(
    conf: EmailTemplateSendConfig
  ): Promise<EmailTemplateSendResult> {
    const { channel, message, locals, test = false } = conf;

    const vars = {
      ...this.globals,
      ...locals,
      date: new Date().toISOString(),
      channel,
    };

    L.debug("rendered: ", this.md.render(template));
    try {
      const html = await htmlMinify(
        juice(`<style>${resetCSS}</style>
    <style>.test {background-color: orange;}</style>
    <div class="test">
    ${this.md.render(Mustache.render(template, vars))}
    </div>`),
        { minifyCSS: true, collapseWhitespace: true }
      );

      const msg: Message & { list: any } = {
        from: `"${this.name}" <${this.from}>`,
        to: `${message.name ?? ""} <${message.to}>`,
        subject: message.subject,
        html,
        text: this.html2text(html),
        list: {
          unsubscribe: {
            url: `https://${this.dns}/email/unsubscribe?channel=${channel}&email=${message.to}`,
            comment: `Unsubscribe from "${channel}" emails`,
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
    } catch (err) {
      L.error("error htmlMinify:", err);
      return { status: "error", value: err };
    }
  }
}
