import fs from "node:fs";
import os from "node:os";
import { isIP } from "node:net";
import { join } from "node:path";
import selfsigned from "selfsigned";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("lite:tls");

export function resolveCertDir(): string {
  if (process.env.SSL_DIR) {
    return process.env.SSL_DIR;
  }
  const home = os.homedir();
  const xdg = process.env.XDG_CONFIG_HOME || join(home, ".config");
  return join(xdg, "cocalc-lite", "devcert");
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function readIfExists(p: string): string | undefined {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return undefined;
  }
}

function getCertPaths(certDir: string, hostname: string) {
  const base = join(certDir, hostname);
  return {
    keyPath: base + ".key.pem",
    certPath: base + ".cert.pem",
  };
}

function buildAltNames(hostname: string, extraHostnames: string[]) {
  const names = new Set<string>();
  const addName = (name?: string) => {
    if (!name) return;
    names.add(name);
  };
  addName(hostname);
  for (const name of extraHostnames) {
    addName(name);
  }
  addName("localhost");
  addName("127.0.0.1");
  addName("::1");
  return Array.from(names).map((name) => {
    if (isIP(name)) {
      return { type: 7, ip: name };
    }
    return { type: 2, value: name };
  });
}

export function getOrCreateSelfSigned(
  hostname: string,
  extraHostnames: string[] = [],
) {
  const certDir = resolveCertDir();
  ensureDir(certDir);
  const { keyPath, certPath } = getCertPaths(certDir, hostname);

  let key = readIfExists(keyPath);
  let cert = readIfExists(certPath);

  if (!key || !cert) {
    const attrs = [{ name: "commonName", value: hostname }];
    const altNames = buildAltNames(hostname, extraHostnames);
    const pems = selfsigned.generate(attrs, {
      days: 365,
      keySize: 2048,
      algorithm: "sha256",
      extensions: [
        {
          name: "subjectAltName",
          altNames,
        },
      ],
    });

    key = pems.private;
    cert = pems.cert;

    fs.writeFileSync(keyPath, key, { mode: 0o600 });
    fs.writeFileSync(certPath, cert, { mode: 0o644 });

    logger.info(`Generated new self-signed cert for ${hostname}`);
    logger.info(`Saved key:  ${keyPath}`);
    logger.info(`Saved cert: ${certPath}`);
  }

  return { key, cert, keyPath, certPath, certDir };
}
