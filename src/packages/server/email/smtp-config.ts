/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import SMTPTransport from "nodemailer/lib/smtp-transport";

import { DNS } from "@cocalc/util/theme";
import { getServerSettings } from "../settings/server-settings";
import siteURL from "../settings/site-url";
import getHelpEmail from "./help";
import { EmailTemplateSenderSettings, SMTPSettings } from "./types";

export async function getEmailTemplatesConfiguration(primary = true): Promise<{
  conf: SMTPTransport.Options & { pool: boolean };
  settings: EmailTemplateSenderSettings;
}> {
  const settings = await getSMTPSettings(primary);
  const serverSettings = await getServerSettings();

  return {
    conf: getConf(settings),
    settings: {
      fromEmail: settings.from,
      fromName: settings.name,
      dns: settings.dns,
      siteURL: await siteURL(),
      siteName: serverSettings.site_name,
      logoSquare: serverSettings.logo_square,
      helpEmail: serverSettings.help_email,
    },
  };
}

export function getConf(settings) {
  const conf: SMTPTransport.Options & { pool: boolean } = {
    host: settings.server,
    port: settings.port,
    secure: settings.secure,
    auth: {
      user: settings.login,
      pass: settings.password,
    },
    pool: settings.pooling === true,
  };
  return conf;
}

export async function getSMTPSettings(primary = true): Promise<SMTPSettings> {
  const settings: SMTPSettings = await getEmailServerSettings(primary);

  const name = primary ? "SMTP" : "SMTP2";

  if (!settings.server) {
    throw Error(`${name} server must be configured`);
  }
  if (!settings.login) {
    throw Error(`${name} username must be configured`);
  }
  if (!settings.password) {
    throw Error(`${name} password must be configured`);
  }

  return settings;
}

/**
 * Depending on if this is for regular or low priority "smtp2" emails,
 * we return the SMTP settings depending on the server settings.
 */
async function getEmailServerSettings(primary = true): Promise<SMTPSettings> {
  const settings = await getServerSettings();

  const name = settings.site_name || "CoCalc";
  const from = settings.email_smtp_from || (await getHelpEmail()); // fallback
  const dns = settings.dns || DNS; // fallback

  const defaultSMTP = {
    server: settings.email_smtp_server,
    login: settings.email_smtp_login,
    password: settings.email_smtp_password,
    secure: settings.email_smtp_secure,
    from,
    port: settings.email_smtp_port,
    name,
    dns,
  };

  if (primary) {
    return defaultSMTP;
  }

  // if the optional secondary SMTP is configured, use it
  if (settings.email_smtp2_enabled) {
    const secondarySMTP = {
      server: settings.email_smtp2_server,
      login: settings.email_smtp2_login,
      password: settings.email_smtp2_password,
      secure: settings.email_smtp2_secure,
      from,
      port: settings.email_smtp2_port,
      name,
      dns,
    };
    return secondarySMTP;
  } else {
    return defaultSMTP;
  }
}
