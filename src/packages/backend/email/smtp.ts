import getPool from "@cocalc/backend/database";
import { createTransport } from "nodemailer";
import type { Transporter } from "nodemailer";
import type { Message } from "./message";
import getHelpEmail from "./help";

export default async function sendEmail(message: Message): Promise<void> {
  let settings: Settings;
  try {
    settings = await getSettings();
  } catch (err) {
    throw Error(
      `SMTP email is not properly configured for this server. Contact the site administrator. -- ${err}`
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
  server.sendMail(message);
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

async function getSettings(): Promise<Settings> {
  const pool = getPool("long"); // rarely changes
  const { rows } = await pool.query(
    "SELECT name, value FROM server_settings WHERE name LIKE 'email_smtp_%'"
  );
  const settings: Partial<Settings> = {};
  const n = "email_smtp_".length;
  for (const row of rows) {
    settings[row.name.slice(n)] = row.value;
  }
  if (!settings.server) {
    throw Error("SMTP email server must be configured");
  }
  if (!settings.login) {
    throw Error("SMTP email username must be configured");
  }
  if (!settings.password) {
    throw Error("SMTP email password must be configured");
  }

  return settings as Settings;
}
