import { createPublicKey } from "crypto";

import { db } from "@cocalc/database";
import getPool from "@cocalc/database/pool";
import {
  getServerSettings,
  resetServerSettingsCache,
} from "@cocalc/database/settings/server-settings";
import getLogger from "@cocalc/backend/logger";
import { callback2 } from "@cocalc/util/async-utils";
import { uuid } from "@cocalc/util/misc";
import {
  decodeSoftwareLicenseToken,
  verifySoftwareLicense,
} from "@cocalc/util/software-licenses/token";

const logger = getLogger("server:software-licenses:activation");

const LICENSE_TOKEN_SETTING = "software_license_token";
const LICENSE_SERVER_URL_SETTING = "software_license_server_url";
const LICENSE_INSTANCE_ID_SETTING = "software_license_instance_id";
const LICENSE_PRIVATE_KEY_SETTING = "software_license_private_key";

export function isLaunchpadMode(): boolean {
  return process.env.COCALC_MODE === "launchpad";
}

async function setServerSetting(name: string, value: string): Promise<void> {
  await callback2(db().set_server_setting, { name, value });
  resetServerSettingsCache();
}

export async function getLicenseToken(): Promise<string> {
  const settings = await getServerSettings();
  return settings?.[LICENSE_TOKEN_SETTING] ?? "";
}

export async function isSoftwareLicenseActivated(): Promise<boolean> {
  if (!isLaunchpadMode()) {
    return true;
  }
  return (await getLicenseToken()) !== "";
}

export async function getLicenseServerUrl(): Promise<string> {
  if (process.env.COCALC_LICENSE_SERVER_URL) {
    return process.env.COCALC_LICENSE_SERVER_URL;
  }
  const settings = await getServerSettings();
  return settings?.[LICENSE_SERVER_URL_SETTING] ?? "";
}

export async function getOrCreateInstanceId(): Promise<string> {
  const settings = await getServerSettings();
  const existing = settings?.[LICENSE_INSTANCE_ID_SETTING];
  if (existing) {
    return existing;
  }
  const id = uuid();
  await setServerSetting(LICENSE_INSTANCE_ID_SETTING, id);
  return id;
}

export async function storeLicenseToken(token: string): Promise<void> {
  await setServerSetting(LICENSE_TOKEN_SETTING, token);
}

export async function activateLicenseOnServer({
  token,
  instance_id,
}: {
  token: string;
  instance_id?: string;
}) {
  const settings = await getServerSettings();
  const privateKey = settings?.[LICENSE_PRIVATE_KEY_SETTING];
  if (!privateKey) {
    throw Error("missing server signing key");
  }
  const publicKey = createPublicKey(privateKey)
    .export({ type: "spki", format: "pem" })
    .toString();
  const verified = verifySoftwareLicense(token, publicKey);
  if (!verified.valid || !verified.payload) {
    throw Error(verified.error ?? "invalid license token");
  }
  const payload = verified.payload;
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT * FROM software_licenses WHERE id=$1",
    [payload.license_id],
  );
  if (rows.length === 0) {
    throw Error("license not found");
  }
  const license = rows[0];
  if (license.revoked_at) {
    throw Error("license revoked");
  }
  if (license.token && license.token !== token) {
    throw Error("license token does not match");
  }
  await pool.query(
    `INSERT INTO software_license_events
      (id, license_id, ts, event, metadata)
     VALUES ($1, $2, NOW(), $3, $4)`,
    [
      uuid(),
      payload.license_id,
      "activate",
      { instance_id: instance_id ?? null },
    ],
  );
  await pool.query(
    "UPDATE software_licenses SET last_refresh_at=NOW() WHERE id=$1",
    [payload.license_id],
  );
  return {
    ok: true,
    license_id: payload.license_id,
    expires_at: license.expires_at ?? payload.expires_at ?? null,
    tier_id: license.tier_id ?? null,
    product: payload.product,
  };
}

export async function activateLicenseOnLaunchpad({
  token,
}: {
  token: string;
}) {
  const serverUrl = await getLicenseServerUrl();
  if (!serverUrl) {
    throw Error("licensing server URL not configured");
  }
  const instance_id = await getOrCreateInstanceId();
  const url = new URL("/api/v2/software/activate", serverUrl);
  const resp = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, instance_id }),
  });
  const payload = (await resp.json().catch(() => ({}))) as {
    error?: string;
    [key: string]: any;
  };
  if (!resp.ok || payload?.error) {
    throw Error(payload?.error ?? `activation failed (${resp.status})`);
  }
  await storeLicenseToken(token);
  return payload;
}

export async function getLicenseStatus() {
  const token = await getLicenseToken();
  if (!token) {
    return { activated: false };
  }
  try {
    const decoded = decodeSoftwareLicenseToken(token);
    return {
      activated: true,
      license_id: decoded.payload?.license_id,
      expires_at: decoded.payload?.expires_at ?? null,
      product: decoded.payload?.product,
    };
  } catch (err) {
    logger.warn("failed to decode stored software license token", { err });
    return { activated: false };
  }
}
