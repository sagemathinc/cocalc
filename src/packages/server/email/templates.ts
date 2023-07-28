/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { delay } from "awaiting";
import { minify as htmlMinify } from "html-minifier-terser";
import { compile as html2textCompile } from "html-to-text";
import stableJson from "json-stable-stringify";
import juice from "juice";
import MarkdownIt from "markdown-it";
import Mustache from "mustache";
import { Transporter, createTransport } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

import { path as ASSETS_DIR } from "@cocalc/assets";
import { getLogger } from "@cocalc/backend/logger";
import { envToInt } from "@cocalc/backend/misc/env-to-number";
import getPool from "@cocalc/database/pool";
import { join } from "node:path";
import { Message } from "./message";
import { getNewsItems } from "./newsletter";
import { getEmailTemplatesConfiguration } from "./smtp-config";
import { EMAIL_CSS, EMAIL_ELEMENTS, EMAIL_TEMPLATES } from "./templates-data";
import {
  EmailSendConfig,
  EmailTemplateName,
  EmailTemplateSendConfig,
  EmailTemplateSendResult,
  EmailTemplateSenderSettings,
} from "./types";

const L = getLogger("email:send-templates");

// set this environment variable for your own set of templates
const TEMPLATES_ROOT =
  process.env.COCALC_EMAIL_TEMPLATES_ROOT ?? join(ASSETS_DIR, "emails");

L.debug({ TEMPLATES_ROOT });

let templateSenderConfig: string | null = "";
let templateSender: EmailTemplateSender | null = null;

function init(
  conf: SMTPTransport.Options,
  settings: EmailTemplateSenderSettings,
  reset = false
): string | null {
  if (!reset && templateSender != null) {
    L.debug("email templates already initialized");
    return null;
  }
  templateSender = new EmailTemplateSender(conf, settings);

  // compute a stable hash of conf and settings and return it
  return stableJson({ conf, settings });
}

export async function initSendingTemplates() {
  const { conf, settings } = await getEmailTemplatesConfiguration();
  return init(conf, settings);
}

async function checkEmailConfigChanged() {
  const { conf, settings } = await getEmailTemplatesConfiguration();
  const newConfig = stableJson({ conf, settings });
  if (newConfig !== templateSenderConfig) {
    L.debug("email template configuration changed, re-initializing");
    templateSenderConfig = await init(conf, settings, true);
  }
}

/**
 * Takes the "message" paramters for building a single email.
 * - adds some data for specific templates
 * Then it sends it to the SMTP server.
 */
export async function send(
  _: EmailSendConfig
): Promise<EmailTemplateSendResult | null> {
  const { to, subject, name, test = false, template, locals } = _;
  if (templateSender == null) {
    throw new Error("email templates sender not initialized");
  }

  if (template === "news") {
    const news = await getNewsItems();
    if (news == null) {
      L.info(`no news to send to ${to}`);
      return null;
    }
    locals.news = news;
  }

  if (template === "password_reset") {
    const { token } = locals;
    if (!token) throw Error("no password reset token");
    locals.resetPath = `/auth/password-reset/${token}`;
  }

  return await templateSender.send({
    test,
    template,
    message: { to, subject, name },
    locals,
  });
}

/**
 * Enqueue the configuration for an email in the database, to be sent later.
 */
export async function enqueue(
  _: EmailSendConfig
): Promise<EmailTemplateSendResult> {
  const { to, subject, name, priority = 0, template, locals } = _;
  const config: Omit<EmailTemplateSendConfig, "template"> = {
    message: { to, subject, name },
    locals,
  };
  L.debug("queueing email", { to, subject, template, locals });
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO email_queue(created, config, template, priority, expire)
     VALUES(NOW(), $1, $2, NOW() + INTERVAL '1 week')
     RETURNING id`,
    [config, template, priority]
  );

  return { status: "queued", value: { id: rows?.[0]?.id } };
}

const EMAIL_QUEUE_DELAY_S = envToInt("COCALC_EMAIL_QUEUE_DELAY_S", 10);
const EMAIL_BATCH_SIZE = envToInt("COCALC_EMAIL_BATCH_SIZE", 100);
const EMAIL_MAX_PER_S = envToInt("COCALC_EMAIL_MAX_PER_S", 10);
// after each email, wait as long as there are at max EMAIL_MAX_PER_S emails per second
const DELAY_MS = Math.max(1, 1000 / EMAIL_MAX_PER_S);

/**
 * Process what's in the queue to send.
 * Loop every EMAIL_QUEUE_DELAY_S seconds and query for the next EMAIL_BATCH_SIZE emails to send.
 */
export async function processQueue(): Promise<void> {
  if (templateSenderConfig !== "") {
    throw new Error("already processing email queue");
  }

  templateSenderConfig = await initSendingTemplates();
  if (templateSenderConfig == null) {
    throw new Error("email templates not initialized");
  }

  L.debug("starting to process email queue");

  const pool = getPool();
  while (true) {
    L.debug("processing email queue");
    try {
      const { rows } = await pool.query(
        `SELECT id, config, template FROM email_queue
        WHERE sent IS NULL
        ORDER BY priority DESC, created ASC
        LIMIT $1`,
        [EMAIL_BATCH_SIZE]
      );

      if (rows.length > 0) {
        for (const { id, config, template } of rows) {
          const status = await send({ ...config, template });
          if (status == null) continue;
          if (status.status !== "sent") {
            L.warn("error sending email:", status);
          }
          await pool.query(
            `UPDATE email_queue SET sent=NOW(), status=$1 WHERE id=$2`,
            [status, id]
          );
        }

        await delay(DELAY_MS);
      }
    } catch (err) {
      L.error("error processing email queue:", err);
    }
    await delay(1000 * EMAIL_QUEUE_DELAY_S);

    // we check if there are changes to the configuration, and if we have to re-initalize
    await checkEmailConfigChanged();
  }
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

  public async send(
    _: EmailTemplateSendConfig
  ): Promise<EmailTemplateSendResult> {
    const { template, message, locals, test = false } = _;

    const msg = await this.buildMessage(template, message, locals);

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

  private async buildMessage(
    template: EmailTemplateName,
    message: { to: string; subject?: string; name?: string },
    locals: Record<string, string | number>
  ): Promise<Message & { list?: any }> {
    const vars = {
      ...this.settings,
      date: new Date().toISOString(),
      ...locals,
      email_addess: message.to,
    };

    const templateData = EMAIL_TEMPLATES[template];
    const subjectTmpl = message.subject ?? templateData.subject;
    const subjectLine = Mustache.render(subjectTmpl, vars);
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

    const { to, name } = message;

    const msg: Message & { list?: any } = {
      from: `"${vars.fromName}" <${vars.fromEmail}>`,
      to: name != null ? `"${name}" <${to}>` : to,
      subject,
      html,
      text: this.html2text(html),
    };

    if (!templateData.unsubscribe) {
      msg.list = {
        unsubscribe: {
          url: `https://${vars.dns}/email/unsubscribe?channel=${template}&email=${message.to}`,
          comment: `Unsubscribe from "${template}" emails`,
        },
      };
    }

    return msg;
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
