/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { createTransport } from "nodemailer";
import type { Transporter } from "nodemailer";
import type { Message } from "./message";
import getHelpEmail from "./help";
import appendFooter from "./footer";
import { getServerSettings } from "../settings/server-settings";

type BackendType = "email" | "password_reset";

export default async function sendEmail(
  message: Message,
  type: BackendType = "email"
): Promise<void> {
  let settings: SMTPSettings;
  try {
    settings = await getSMTPSettings(type);
  } catch (err) {
    throw Error(
      `SMTP ${type} is not properly configured for this server. Contact the site administrator. -- ${err}`
    );
  }

  if (!message.from) {
    if (settings.from) {
      message.from = settings.from;
    } else {
      message.from = await getHelpEmail(); // fallback
    }
  }
  const server = await getServer(settings);
  const msg = await appendFooter(message);
  await server.sendMail(msg);
}

let server: undefined | Transporter = undefined;
let cacheSettings = ""; // what settings were used to compute cached server.
async function getServer(settings): Promise<Transporter> {
  const s = JSON.stringify(settings);
  if (server !== undefined && s == cacheSettings) return server;
  server = await createTransport({
    host: settings.server,
    port: settings.port,
    secure: settings.secure,
    auth: {
      user: settings.login,
      pass: settings.password,
    },
  });
  cacheSettings = s;
  return server;
}

interface SMTPSettings {
  server: string;
  login: string;
  password: string;
  secure: boolean;
  from?: string;
  port?: string;
}

/**
 * Depending on if this is for regular emails or password resets,
 * we return the SMTP settings depending on the server settings.
 * Usually, password reset and regular email settings are the same for SMTP.
 * Only exception is when that override entry is set to smtp, then use the
 * secondary SMTP configuartion.
 */
async function getEmailServerSettings(
  type: BackendType
): Promise<SMTPSettings> {
  const settings = await getServerSettings();

  const defaultSMTP = {
    server: settings.email_smtp_server,
    login: settings.email_smtp_login,
    password: settings.email_smtp_password,
    secure: settings.email_smtp_secure,
    from: settings.email_smtp_from,
    port: settings.email_smtp_port,
  };

  if (type == "email") {
    return defaultSMTP;
  }

  switch (settings.password_reset_override) {
    case "default":
      return defaultSMTP;

    case "smtp":
      return {
        server: settings.password_reset_smtp_server,
        login: settings.password_reset_smtp_login,
        password: settings.password_reset_smtp_password,
        secure: settings.password_reset_smtp_secure,
        from: settings.password_reset_smtp_from,
        port: settings.password_reset_smtp_port,
      };
  }
  throw new Error(
    `unexpected password_reset_override: ${settings.password_reset_override}`
  );
}

async function getSMTPSettings(type: BackendType): Promise<SMTPSettings> {
  if (type != "email" && type != "password_reset") {
    throw Error("type must be 'email' or 'password_reset'");
  }
  const settings: SMTPSettings = await getEmailServerSettings(type);

  if (!settings.server) {
    throw Error(`SMTP ${type} server must be configured`);
  }
  if (!settings.login) {
    throw Error(`SMTP ${type} username must be configured`);
  }
  if (!settings.password) {
    throw Error(`SMTP ${type} password must be configured`);
  }

  return settings;
}
