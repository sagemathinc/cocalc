import jsonStableStringify from "json-stable-stringify";
import { createPrivateKey, createPublicKey, sign, verify } from "crypto";

export interface SoftwareLicensePayload {
  product: "launchpad" | "rocket";
  license_id: string;
  customer_id?: string;
  issued_at: string;
  valid_from?: string;
  expires_at?: string;
  refresh_interval_hours?: number;
  grace_days?: number;
  require_online_refresh?: boolean;
  features?: Record<string, any>;
  limits?: {
    max_accounts?: number;
    max_project_hosts?: number;
    [key: string]: any;
  };
  instance_binding?: "none" | "instance_pubkey";
  instance_pubkey?: string;
}

export interface SoftwareLicenseToken {
  version: 1;
  payload: SoftwareLicensePayload;
  signature: string; // base64
}

function canonicalizePayload(payload: SoftwareLicensePayload): string {
  return jsonStableStringify(payload);
}

export function encodeSoftwareLicenseToken(
  token: SoftwareLicenseToken,
): string {
  return Buffer.from(JSON.stringify(token), "utf8").toString("base64");
}

export function decodeSoftwareLicenseToken(raw: string): SoftwareLicenseToken {
  const trimmed = raw.trim();
  const json =
    trimmed.startsWith("{") ? trimmed : Buffer.from(trimmed, "base64").toString("utf8");
  return JSON.parse(json);
}

export function signSoftwareLicense(
  payload: SoftwareLicensePayload,
  privateKeyPem: string,
): SoftwareLicenseToken {
  const key = createPrivateKey(privateKeyPem);
  const canonical = canonicalizePayload(payload);
  const signature = sign(null, Buffer.from(canonical), key).toString("base64");
  return { version: 1, payload, signature };
}

export function verifySoftwareLicense(
  tokenRaw: string,
  publicKeyPem: string,
): { valid: boolean; payload?: SoftwareLicensePayload; error?: string } {
  try {
    const token = decodeSoftwareLicenseToken(tokenRaw);
    if (token?.version !== 1 || token?.payload == null || !token.signature) {
      return { valid: false, error: "invalid token format" };
    }
    const canonical = canonicalizePayload(token.payload);
    const signature = Buffer.from(token.signature, "base64");
    const key = createPublicKey(publicKeyPem);
    const ok = verify(null, Buffer.from(canonical), key, signature);
    if (!ok) {
      return { valid: false, error: "signature verification failed" };
    }
    return { valid: true, payload: token.payload };
  } catch (err) {
    return { valid: false, error: String(err) };
  }
}
