/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

//########################################
// Sending emails
//########################################

const BANNED_DOMAINS = { "qq.com": true };

import { isEqual, template } from "lodash";
// import * as os_path from "node:path";
import { createTransport } from "nodemailer";
import sanitizeHtml from "sanitize-html";

// import base_path from "@cocalc/backend/base-path";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import { AllSiteSettingsCached } from "@cocalc/util/db-schema/types";
import { getLogger } from "./logger";
import { contains_url } from "@cocalc/backend/misc";
import { site_settings_conf } from "@cocalc/util/db-schema/site-defaults";
import { defaults, required, to_json } from "@cocalc/util/misc";
import {
  COMPANY_EMAIL,
  COMPANY_NAME,
  DNS,
  HELP_EMAIL,
  SITE_NAME,
} from "@cocalc/util/theme";

const winston = getLogger("email");

export function escape_email_body(body: string, allow_urls: boolean): string {
  // in particular, no img and no anchor a
  const allowedTags: string[] = [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "p",
    "ul",
    "ol",
    "nl",
    "li",
    "b",
    "i",
    "strong",
    "em",
    "strike",
    "code",
    "hr",
    "br",
    "div",
    "table",
    "thead",
    "caption",
    "tbody",
    "tr",
    "th",
    "td",
    "pre",
  ];
  if (allow_urls) {
    allowedTags.push("a");
  }
  return sanitizeHtml(body, { allowedTags });
}

function fallback(val: string | undefined, alt: string) {
  if (typeof val == "string" && val.length > 0) {
    return val;
  } else {
    return alt;
  }
}

// global state
let smtp_server: any | undefined = undefined;
let smtp_server_created: number | undefined = undefined; // timestamp
let smtp_server_conf: any | undefined = undefined;

async function init_smtp_server(opts: Opts, dbg): Promise<void> {
  const s = opts.settings;

  const conf = {
    host: s.email_smtp_server,
    port: s.email_smtp_port,
    secure: s.email_smtp_secure, // true for 465, false for other ports
    auth: {
      user: s.email_smtp_login,
      pass: s.email_smtp_password,
    },
  };

  // we check, if we can keep the smtp server instance
  if (
    smtp_server != null &&
    smtp_server_conf != null &&
    s._timestamp != null &&
    smtp_server_created != null
  ) {
    if (smtp_server_created < s._timestamp) {
      if (!isEqual(smtp_server_conf, conf)) {
        dbg("SMTP server instance outdated, recreating");
      } else {
        // settings changed, but the server config is the same
        smtp_server_created = Date.now();
        return;
      }
    } else {
      return;
    }
  }
  dbg("SMTP server not configured. setting up ...");
  smtp_server = await createTransport(conf);
  smtp_server_created = Date.now();
  smtp_server_conf = conf;
  dbg("SMTP server configured");
}

async function send_via_smtp(opts: Opts, dbg): Promise<string | undefined> {
  dbg("sending email via SMTP backend");
  const msg: any = {
    from: opts.from,
    to: opts.to,
    subject: opts.subject,
    html: smtp_email_body(opts),
  };
  if (opts.replyto) {
    msg.replyTo = opts.replyto;
  }
  if (opts.cc != null && opts.cc.length > 0) {
    msg.cc = opts.cc;
  }
  if (opts.bcc != null && opts.bcc.length > 0) {
    msg.bcc = opts.bcc;
  }
  const info = await smtp_server.sendMail(msg);
  dbg(`sending email via SMTP succeeded -- message id='${info.messageId}'`);
  return info.messageId;
}

// constructs the email body for INVITES! (collaborator and student course)
// this includes sign up instructions pointing to the given project
// it might throw an error!
function create_email_body(
  subject,
  body,
  email_address,
  project_title,
  link2proj,
  allow_urls_in_emails
): string {
  let direct_link: string;
  let base_url: string;
  if (link2proj != null) {
    const base_url_segments = link2proj.split("/");
    base_url = `${base_url_segments[0]}//${base_url_segments[2]}`;
    direct_link = `Open <a href='${link2proj}'>the project '${project_title}'</a>.`;
  } else {
    // no link2proj provided -- show something useful:
    direct_link = "";
    base_url = "https://cocalc.com";
  }

  let email_body = "";
  if (body) {
    email_body = escape_email_body(body, allow_urls_in_emails);
    // we check if there are plain URLs, which can be used to send SPAM
    if (!allow_urls_in_emails && contains_url(email_body)) {
      throw new Error("Sorry, links to specific websites are not allowed!");
    }
  } else {
    email_body = subject;
  }

  email_body += `
<br/><br/>
<b>To accept the invitation:
<ol>
<li>Open <a href="${base_url}/app">CoCalc</a></li>
<li>Sign up/in using <i>exactly</i> your email address <code>${email_address}</code></li>
<li>${direct_link}</li>
</ol></b>
<br/><br />
(If you're already signed in via <i>another</i> email address,
 you have to sign out and sign up/in using the mentioned email address.)
`;

  return email_body;
}

interface InviteOpts {
  to: string;
  subject: string;
  email: string;
  email_address: string;
  title: string;
  settings: AllSiteSettingsCached;
  allow_urls: boolean;
  link2proj?: string;
  replyto: string;
  replyto_name: string;
  cb: (err?, msg?) => void;
}

export function send_invite_email(opts: InviteOpts) {
  try {
    const email_body = create_email_body(
      opts.subject,
      opts.email,
      opts.email_address,
      opts.title,
      opts.link2proj,
      opts.allow_urls
    );
    send_email({
      to: opts.to,
      bcc:
        opts.settings.kucalc === KUCALC_COCALC_COM ? "invites@cocalc.com" : "",
      fromname: fallback(opts.settings.organization_name, COMPANY_NAME),
      from: fallback(opts.settings.organization_email, COMPANY_EMAIL),
      category: "invite",
      settings: opts.settings,
      subject: opts.subject,
      body: email_body,
      replyto: opts.replyto,
      replyto_name: opts.replyto_name,
      cb: opts.cb,
    });
  } catch (err) {
    opts.cb(err);
  }
}

export function is_banned(address): boolean {
  const i = address.indexOf("@");
  if (i === -1) {
    return false;
  }
  const x = address.slice(i + 1).toLowerCase();
  return !!BANNED_DOMAINS[x];
}

function make_dbg(opts) {
  if (opts.verbose) {
    return (m) => winston.debug(`send_email(to:${opts.to}) -- ${m}`);
  } else {
    return function (_) {};
  }
}

const smtp_footer = `
<p style="margin-top:150px; border-top: 1px solid gray; color: gray; font-size:85%; text-align:center">
This email was sent by <a href="<%= url %>"><%= settings.site_name %></a> by <%= company_name %>.
Contact <a href="mailto:<%= settings.help_email %>"><%= settings.help_email %></a> if you have any questions.
</p>`;

const smtp_email_body_tmpl = template(`
<%= body %>

${smtp_footer}
`);

// construct the email body for mails sent via smtp
function smtp_email_body(opts: Opts): string {
  return smtp_email_body_tmpl(opts);
}

interface Opts {
  subject: string;
  body: string;
  fromname?: string;
  from?: string;
  to: string;
  replyto?: string;
  replyto_name?: string;
  cc?: string;
  bcc?: string;
  verbose?: boolean;
  category?: string;
  asm_group?: number;
  // "Partial" b/c any might be missing for random reasons
  settings: AllSiteSettingsCached;
  url?: string; // for the string templates
  company_name?: string; // for the string templates
  cb?: (err?, msg?) => void;
}

const opts_default: any = {
  subject: required,
  body: required,
  fromname: undefined,
  from: undefined,
  to: required,
  replyto: undefined,
  replyto_name: undefined,
  cc: "",
  bcc: "",
  verbose: true,
  cb: undefined,
  category: undefined,
  settings: required,
};

// here's how I test this function:
//    require('email').send_email(subject:'TEST MESSAGE', body:'body', to:'wstein@sagemath.com', cb:console.log)
export async function send_email(opts: Opts): Promise<void> {
  const settings = opts.settings;
  const company_name = fallback(settings.organization_name, COMPANY_NAME);
  opts_default.fromname = opts_default.fromname || company_name;
  opts_default.from = opts_default.from || settings.organization_email;
  opts = defaults(opts, opts_default);
  opts.company_name = company_name;

  const dns = fallback(settings.dns, DNS);
  opts.url = `https://${dns}`;

  const dbg = make_dbg(opts);
  dbg(`${opts.body.slice(0, 201)}...`);

  if (is_banned(opts.to) || is_banned(opts.from)) {
    dbg("WARNING: attempt to send banned email");
    if (typeof opts.cb === "function") {
      opts.cb("banned domain");
    }
    return;
  }

  // logic:
  // 0. email_enabled == false, don't send any emails, period.
  // 1. category password_reset and verify are sent via templates and high priority

  // an optional message to log and report back
  let message: string | undefined = undefined;

  if (opts.settings.email_enabled == false) {
    const x = site_settings_conf.email_enabled.name;
    message = `sending any emails is disabled -- see 'Admin/Site Settings/${x}'`;
    dbg(message);
  }

  // const pw_reset_smtp =
  //   opts.category == "password_reset" &&
  //   opts.settings.password_reset_override == "smtp";

  // const email_verify_smtp =
  //   opts.category == "verify" &&
  //   opts.settings.password_reset_override == "smtp";

  const email_backend = opts.settings.email_backend ?? "smtp";

  try {
    // INIT phase
    await init_smtp_server(opts, dbg);

    // SEND phase
    switch (email_backend) {
      case "sendgrid":
      case "smtp":
        await send_via_smtp(opts, dbg);
        break;
      case "none":
        message =
          "no email sent, because email_backend is 'none' -- configure it in 'Admin/Site Settings'";
        dbg(message);
        break;
    }

    // all fine, no errors
    typeof opts.cb === "function" ? opts.cb(undefined, message) : undefined;
  } catch (err) {
    if (err) {
      // so next time it will try fresh to connect to email server, rather than being wrecked forever.
      err = `error sending email -- ${to_json(err)}`;
      dbg(err);
    } else {
      dbg("successfully sent email");
    }
    typeof opts.cb === "function" ? opts.cb(err, message) : undefined;
  }
}

// export function welcome_email(opts): void {
//   let body, category, subject;
//   opts = defaults(opts, {
//     to: required,
//     token: required, // the email verification token
//     only_verify: false, // TODO only send the verification token, for now this is good enough
//     settings: required,
//     cb: undefined,
//   });

//   if (opts.to == null) {
//     // users can sign up without an email address. ignore this.
//     typeof opts.cb === "function" ? opts.cb(undefined) : undefined;
//     return;
//   }

//   const settings = opts.settings;
//   const site_name = fallback(settings.site_name, SITE_NAME);
//   const dns = fallback(settings.dns, DNS);
//   const url = `https://${dns}`;
//   const token_query = encodeURI(
//     `email=${encodeURIComponent(opts.to)}&token=${opts.token}`
//   );
//   const endpoint = os_path.join(base_path, "auth", "verify");
//   const token_url = `${url}${endpoint}?${token_query}`;
//   const verify_emails = opts.settings.verify_emails ?? true;

//   if (opts.only_verify) {
//     // only send the verification email, if settings.verify_emails is true
//     if (!verify_emails) return;
//     subject = `Verify your email address on ${site_name} (${dns})`;
//     body = verify_email_html(token_url);
//     category = "verify";
//   } else {
//     subject = `Welcome to ${site_name} - ${dns}`;
//     body = welcome_email_html({ token_url, verify_emails, site_name, url });
//     category = "welcome";
//   }

//   send_email({
//     subject,
//     body,
//     fromname: fallback(settings.organization_name, COMPANY_NAME),
//     from: fallback(settings.organization_email, COMPANY_EMAIL),
//     to: opts.to,
//     cb: opts.cb,
//     category,
//     settings: opts.settings,
//   });
// }

export function email_verified_successfully(url): string {
  const title = `${SITE_NAME}: Email verification successful`;

  return `<DOCTYPE html>
<html>
<head>
<meta http-equiv="refresh" content="5;url=${url}" />
<style>
* {font-family: sans-serif;}
</style>
  <title>${title}</title>
</head>
<body>
<h1>Email verification successful!</h1>
<div>
Click <a href="${url}">here</a> if you aren't automatically redirected to <a href="${url}">${SITE_NAME}</a> within 30 seconds.
</div>
</body>
</html>
`;
}

export function email_verification_problem(url, problem): string {
  const title = `${SITE_NAME}: Email verification problem`;

  return `<DOCTYPE html>
<html>
<head>
<style>
div, p, h1, h2 {font-family: sans-serif;}
div {margin-top: 1rem;}
</style>
  <title>${title}</title>
</head>
<body>
  <h1>${title}</h1>
  <div>There was a problem verifying your email address.</div>
  <div>Reason: <code>${problem}</code></div>
  <div>
    Continue to <a href="${url}">${SITE_NAME}</a> or
    contact support: <a href="mailto:${HELP_EMAIL}">${HELP_EMAIL}</a>.
  </div>
</body>
</html>
  `;
}
