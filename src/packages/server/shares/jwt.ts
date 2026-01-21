import { readFile } from "node:fs/promises";

import { getServerSettings } from "@cocalc/database/settings/server-settings";

export async function resolveShareJwtSecret(): Promise<string> {
  const settings = await getServerSettings();
  const path = settings.share_jwt_secret_path?.trim();
  if (path) {
    return (await readFile(path, "utf8")).trim();
  }
  const stored = settings.share_jwt_secret?.trim();
  if (stored) {
    return stored;
  }
  const envSecret = process.env.SHARE_JWT_SECRET;
  if (envSecret) {
    return envSecret;
  }
  throw new Error("share JWT secret not configured");
}
