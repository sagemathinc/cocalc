#!/usr/bin/env node
"use strict";

/*
 * publish-r2.js
 *
 * Uploads a build artifact to Cloudflare R2 (S3-compatible) using SigV4.
 * - Uploads the file and a sibling .sha256 file.
 * - Optionally writes a "latest" manifest JSON (url, sha256, size, built_at, os, arch).
 * - Can also copy an existing object (e.g., staging -> latest) without
 *   uploading a new file.
 *
 * Required env:
 *   COCALC_R2_ACCOUNT_ID, COCALC_R2_ACCESS_KEY_ID, COCALC_R2_SECRET_ACCESS_KEY,
 *   COCALC_R2_BUCKET
 *   COCALC_R2_PUBLIC_BASE_URL (serving domain for public URLs, e.g., https://software.cocalc.ai)
 *
 * Optional env:
 *   COCALC_R2_PREFIX, COCALC_R2_LATEST_KEY,
 *   COCALC_R2_CACHE_CONTROL, COCALC_R2_LATEST_CACHE_CONTROL,
 *   COCALC_R2_COPY_FROM, COCALC_R2_COPY_TO
 *
 * Examples:
 *   node publish-r2.js --file ./artifact.tar.xz --bucket cocalc-artifacts \
 *     --prefix software/project-host/0.1.7 --latest-key software/project-host/latest-linux-amd64.json \
 *     --os linux --arch amd64
 *   node publish-r2.js --bucket cocalc-artifacts \
 *     --copy-from software/project-host/staging.json \
 *     --copy-to software/project-host/latest.json
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");

function usage() {
  console.error(
    "Usage: publish-r2.js --file <path> --bucket <bucket> [--key <key>] [--prefix <prefix>] [--public-base-url <url>] [--latest-key <key>] [--os <os>] [--arch <arch>] [--cache-control <value>] [--latest-cache-control <value>] [--copy-from <key> --copy-to <key>]",
  );
  process.exit(2);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function encodeRfc3986(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalizePath(bucket, key) {
  const parts = [bucket, ...key.split("/").filter(Boolean)];
  return `/${parts.map(encodeRfc3986).join("/")}`;
}

function hashHex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function hmac(key, data, encoding) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest(encoding);
}

function getSignatureKey(secret, dateStamp, region, service) {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function joinKey(prefix, filename) {
  if (!prefix) return filename;
  return `${prefix.replace(/\/+$/, "")}/${filename}`;
}

async function hashFile(filePath) {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function putObject({
  host,
  region,
  accessKey,
  secretKey,
  bucket,
  key,
  body,
  contentType,
  cacheControl,
}) {
  const method = "PUT";
  const service = "s3";
  const now = new Date();
  const amzDate = now
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = hashHex(body);
  const headers = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) {
    headers["content-type"] = contentType;
  }
  if (cacheControl) {
    headers["cache-control"] = cacheControl;
  }

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${String(headers[name]).trim()}\n`)
    .join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalUri = canonicalizePath(bucket, key);
  const canonicalRequest = [
    method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hashHex(canonicalRequest),
  ].join("\n");
  const signingKey = getSignatureKey(secretKey, dateStamp, region, service);
  const signature = hmac(signingKey, stringToSign, "hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const requestHeaders = {
    ...headers,
    authorization,
    "content-length": Buffer.byteLength(body),
  };

  await new Promise((resolve, reject) => {
    const req = https.request(
      {
        method,
        host,
        path: canonicalUri,
        headers: requestHeaders,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
            return;
          }
          reject(
            new Error(
              `R2 PUT failed (${res.statusCode}): ${Buffer.concat(chunks).toString("utf8")}`,
            ),
          );
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function copyObject({
  host,
  region,
  accessKey,
  secretKey,
  bucket,
  sourceKey,
  destKey,
}) {
  const method = "PUT";
  const service = "s3";
  const now = new Date();
  const amzDate = now
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = hashHex("");
  const copySource = canonicalizePath(bucket, sourceKey);
  const headers = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    "x-amz-copy-source": copySource,
  };

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${String(headers[name]).trim()}\n`)
    .join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalUri = canonicalizePath(bucket, destKey);
  const canonicalRequest = [
    method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hashHex(canonicalRequest),
  ].join("\n");
  const signingKey = getSignatureKey(secretKey, dateStamp, region, service);
  const signature = hmac(signingKey, stringToSign, "hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const requestHeaders = {
    ...headers,
    authorization,
    "content-length": 0,
  };

  await new Promise((resolve, reject) => {
    const req = https.request(
      {
        method,
        host,
        path: canonicalUri,
        headers: requestHeaders,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
            return;
          }
          reject(
            new Error(
              `R2 COPY failed (${res.statusCode}): ${Buffer.concat(chunks).toString("utf8")}`,
            ),
          );
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const copyFrom = args["copy-from"] || process.env.COCALC_R2_COPY_FROM;
  const copyTo = args["copy-to"] || process.env.COCALC_R2_COPY_TO;
  const accountId = args["account-id"] || process.env.COCALC_R2_ACCOUNT_ID;
  const accessKey =
    args["access-key"] || process.env.COCALC_R2_ACCESS_KEY_ID;
  const secretKey =
    args["secret-key"] || process.env.COCALC_R2_SECRET_ACCESS_KEY;
  const bucket = args.bucket || process.env.COCALC_R2_BUCKET;
  if (!accountId || !accessKey || !secretKey || !bucket) {
    throw new Error(
      "Missing R2 credentials; set COCALC_R2_ACCOUNT_ID, COCALC_R2_ACCESS_KEY_ID, COCALC_R2_SECRET_ACCESS_KEY, and COCALC_R2_BUCKET.",
    );
  }

  const region = args.region || process.env.COCALC_R2_REGION || "auto";
  if (copyFrom || copyTo) {
    if (!copyFrom || !copyTo) {
      throw new Error("copy-from and copy-to must both be set");
    }
    const host = `${accountId}.r2.cloudflarestorage.com`;
    await copyObject({
      host,
      region,
      accessKey,
      secretKey,
      bucket,
      sourceKey: copyFrom,
      destKey: copyTo,
    });
    process.stdout.write(`copied ${copyFrom} -> ${copyTo}\n`);
    return;
  }

  const filePath = args.file || process.env.COCALC_R2_FILE;
  if (!filePath) {
    usage();
  }

  const prefix = args.prefix || process.env.COCALC_R2_PREFIX || "";
  const publicBaseUrl =
    args["public-base-url"] ||
    process.env.COCALC_R2_PUBLIC_BASE_URL ||
    "";
  const cacheControl =
    args["cache-control"] ||
    process.env.COCALC_R2_CACHE_CONTROL ||
    "public, max-age=31536000, immutable";
  const latestCacheControl =
    args["latest-cache-control"] ||
    process.env.COCALC_R2_LATEST_CACHE_CONTROL ||
    "public, max-age=300";
  const latestKey = args["latest-key"] || process.env.COCALC_R2_LATEST_KEY;
  const manifestOs = args.os || process.env.COCALC_R2_OS;
  const manifestArch = args.arch || process.env.COCALC_R2_ARCH;

  const host = `${accountId}.r2.cloudflarestorage.com`;
  const filename = path.basename(filePath);
  const key = args.key || joinKey(prefix, filename);
  const contentType =
    args["content-type"] ||
    process.env.COCALC_R2_CONTENT_TYPE ||
    "application/octet-stream";

  const fileStat = fs.statSync(filePath);
  const fileHash = await hashFile(filePath);
  const fileBody = fs.readFileSync(filePath);

  await putObject({
    host,
    region,
    accessKey,
    secretKey,
    bucket,
    key,
    body: fileBody,
    contentType,
    cacheControl,
  });

  const shaBody = Buffer.from(`${fileHash}  ${filename}\n`, "utf8");
  await putObject({
    host,
    region,
    accessKey,
    secretKey,
    bucket,
    key: `${key}.sha256`,
    body: shaBody,
    contentType: "text/plain",
    cacheControl,
  });

  if (latestKey) {
    const urlBase = publicBaseUrl.replace(/\/+$/, "");
    const url = urlBase
      ? `${urlBase}/${key}`
      : `https://${host}/${bucket}/${key}`;
    const manifest = {
      url,
      sha256: fileHash,
      size_bytes: fileStat.size,
      built_at: new Date().toISOString(),
    };
    if (manifestOs) {
      manifest.os = manifestOs;
    }
    if (manifestArch) {
      manifest.arch = manifestArch;
    }
    const manifestBody = Buffer.from(JSON.stringify(manifest, null, 2));
    await putObject({
      host,
      region,
      accessKey,
      secretKey,
      bucket,
      key: latestKey,
      body: manifestBody,
      contentType: "application/json",
      cacheControl: latestCacheControl,
    });
  }

  process.stdout.write(`uploaded ${key}\n`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
