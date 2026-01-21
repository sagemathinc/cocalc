#!/usr/bin/env node

/*
 * publish-static-assets.mjs
 *
 * Uploads a static asset directory to Cloudflare R2 (S3-compatible) using SigV4.
 * - Recursively uploads files under the source directory.
 * - Excludes source maps and embed-*.js by default.
 * - Writes a manifest JSON and optional latest JSON.
 *
 * Required env:
 *   COCALC_R2_ACCOUNT_ID, COCALC_R2_ACCESS_KEY_ID, COCALC_R2_SECRET_ACCESS_KEY,
 *   COCALC_R2_BUCKET
 *   COCALC_R2_PUBLIC_BASE_URL (serving domain for public URLs, e.g., https://software.cocalc.ai)
 *
 * Optional env:
 *   COCALC_R2_PREFIX, COCALC_R2_LATEST_KEY, COCALC_R2_MANIFEST_KEY,
 *   COCALC_R2_CACHE_CONTROL, COCALC_R2_HTML_CACHE_CONTROL, COCALC_R2_REGION
 *
 * Example:
 *   node publish-static-assets.mjs --source ./dist --prefix software/static/1.23.4 \
 *     --latest-key software/static/latest.json
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as https from "node:https";
import * as path from "node:path";

const DEFAULT_CACHE_CONTROL = "public, max-age=31536000, immutable";
const DEFAULT_HTML_CACHE_CONTROL = "public, max-age=300";
const EXCLUDES = [/\.map$/, /(^|\/)embed-.*\.js$/];

function usage() {
  console.error(
    "Usage: publish-static-assets.mjs --source <dir> --bucket <bucket> [--prefix <prefix>] [--public-base-url <url>] [--latest-key <key>] [--manifest-key <key>] [--cache-control <value>] [--html-cache-control <value>] [--version <version>]",
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
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
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

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function shouldExclude(relPath) {
  return EXCLUDES.some((pattern) => pattern.test(relPath));
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript";
    case ".css":
      return "text/css";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    case ".ttf":
      return "font/ttf";
    case ".json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
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

async function listFiles(rootDir) {
  const entries = [];
  async function walk(dir) {
    const items = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!item.isFile()) continue;
      const relPath = toPosixPath(path.relative(rootDir, fullPath));
      if (!relPath || shouldExclude(relPath)) continue;
      const stats = await fs.promises.stat(fullPath);
      entries.push({ relPath, fullPath, size: stats.size });
    }
  }
  await walk(rootDir);
  entries.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return entries;
}

async function putObject({
  host,
  region,
  accessKey,
  secretKey,
  bucket,
  key,
  filePath,
  body,
  contentLength,
  contentType,
  cacheControl,
  payloadHash,
}) {
  if (!filePath && !body) {
    throw new Error("putObject requires filePath or body");
  }
  const method = "PUT";
  const service = "s3";
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
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
  const length = contentLength ?? (body ? body.length : 0);

  const requestHeaders = {
    ...headers,
    authorization,
    "content-length": length,
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
    if (body) {
      req.write(body);
      req.end();
      return;
    }
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.pipe(req);
  });
}

async function putJson({
  host,
  region,
  accessKey,
  secretKey,
  bucket,
  key,
  value,
  cacheControl,
}) {
  const body = Buffer.from(JSON.stringify(value, null, 2));
  await putObject({
    host,
    region,
    accessKey,
    secretKey,
    bucket,
    key,
    body,
    contentLength: body.length,
    contentType: "application/json",
    cacheControl,
    payloadHash: hashHex(body),
  });
}

async function main() {
  const args = parseArgs(process.argv);

  const accountId = args.account || process.env.COCALC_R2_ACCOUNT_ID || "";
  const accessKey =
    args["access-key"] || process.env.COCALC_R2_ACCESS_KEY_ID || "";
  const secretKey =
    args["secret-key"] || process.env.COCALC_R2_SECRET_ACCESS_KEY || "";
  const bucket = args.bucket || process.env.COCALC_R2_BUCKET || "";
  const region = args.region || process.env.COCALC_R2_REGION || "auto";

  const source = args.source || process.env.COCALC_STATIC_SOURCE;
  if (!accountId || !accessKey || !secretKey || !bucket || !source) {
    usage();
  }

  const prefix = args.prefix || process.env.COCALC_R2_PREFIX || "";
  const publicBaseUrl =
    args["public-base-url"] || process.env.COCALC_R2_PUBLIC_BASE_URL || "";
  const cacheControl =
    args["cache-control"] ||
    process.env.COCALC_R2_CACHE_CONTROL ||
    DEFAULT_CACHE_CONTROL;
  const htmlCacheControl =
    args["html-cache-control"] ||
    process.env.COCALC_R2_HTML_CACHE_CONTROL ||
    DEFAULT_HTML_CACHE_CONTROL;
  const version = args.version || process.env.COCALC_STATIC_VERSION || "";
  const latestKey = args["latest-key"] || process.env.COCALC_R2_LATEST_KEY;
  const manifestKey =
    args["manifest-key"] ||
    process.env.COCALC_R2_MANIFEST_KEY ||
    (prefix ? `${prefix.replace(/\/+$/, "")}/manifest.json` : "");

  const host = `${accountId}.r2.cloudflarestorage.com`;
  const rootDir = path.resolve(source);
  if (!fs.existsSync(rootDir)) {
    throw new Error(`source directory not found: ${rootDir}`);
  }

  const files = await listFiles(rootDir);
  if (!files.length) {
    throw new Error(`no files found under ${rootDir}`);
  }

  let totalBytes = 0;
  const manifestFiles = [];
  for (const entry of files) {
    const key = prefix
      ? `${prefix.replace(/\/+$/, "")}/${entry.relPath}`
      : entry.relPath;
    const contentType = contentTypeFor(entry.fullPath);
    const cache = entry.relPath.endsWith(".html")
      ? htmlCacheControl
      : cacheControl;
    const fileHash = await hashFile(entry.fullPath);
    await putObject({
      host,
      region,
      accessKey,
      secretKey,
      bucket,
      key,
      filePath: entry.fullPath,
      contentLength: entry.size,
      contentType,
      cacheControl: cache,
      payloadHash: fileHash,
    });
    totalBytes += entry.size;
    manifestFiles.push({
      key,
      sha256: fileHash,
      size_bytes: entry.size,
    });
    process.stdout.write(`uploaded ${key}\n`);
  }

  if (manifestKey) {
    const baseUrl = publicBaseUrl.replace(/\/+$/, "");
    const manifest = {
      version,
      prefix,
      built_at: new Date().toISOString(),
      file_count: manifestFiles.length,
      total_bytes: totalBytes,
      base_url: baseUrl ? `${baseUrl}/${prefix}` : "",
      files: manifestFiles,
    };
    await putJson({
      host,
      region,
      accessKey,
      secretKey,
      bucket,
      key: manifestKey,
      value: manifest,
      cacheControl: htmlCacheControl,
    });
    process.stdout.write(`uploaded ${manifestKey}\n`);

    if (latestKey) {
      const latest = {
        version,
        manifest_key: manifestKey,
        manifest_url: baseUrl ? `${baseUrl}/${manifestKey}` : "",
        built_at: manifest.built_at,
        file_count: manifest.file_count,
        total_bytes: manifest.total_bytes,
      };
      await putJson({
        host,
        region,
        accessKey,
        secretKey,
        bucket,
        key: latestKey,
        value: latest,
        cacheControl: htmlCacheControl,
      });
      process.stdout.write(`uploaded ${latestKey}\n`);
    }
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
