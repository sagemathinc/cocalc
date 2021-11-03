import getPool from "@cocalc/database/pool";
import { createTransport } from "nodemailer";
import type { Transporter } from "nodemailer";
import type { Message } from "./message";
import getHelpEmail from "./help";
import appendFooter from "./footer";

export default async function sendEmail(
  message: Message,
  type: "email" | "password_reset" = "email"
): Promise<void> {
  let settings: Settings;
  try {
    settings = await getSettings(type);
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
    secure: !settings.port || settings.port == "465",
    auth: {
      user: settings.login,
      pass: settings.password,
    },
  });
  cacheSettings = s;
  return server;
}

interface Settings {
  server: string;
  login: string;
  password: string;
  from?: string;
  port?: string;
}

async function getSettings(
  type: "email" | "password_reset"
): Promise<Settings> {
  if (type != "email" && type != "password_reset") {
    throw Error("type must be 'email' or 'password_reset'");
  }
  const pool = getPool("long"); // rarely changes
  const { rows } = await pool.query(
    `SELECT name, value FROM server_settings WHERE name LIKE '${type}_smtp_%'`
  );
  const settings: Partial<Settings> = {};
  const n = `${type}_smtp_`.length;
  for (const row of rows) {
    settings[row.name.slice(n)] = row.value;
  }
  if (!settings.server) {
    throw Error(`SMTP ${type} server must be configured`);
  }
  if (!settings.login) {
    throw Error(`SMTP ${type} username must be configured`);
  }
  if (!settings.password) {
    throw Error(`SMTP ${type} password must be configured`);
  }

  return settings as Settings;
}
