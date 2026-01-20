/*
Lightweight S3-compatible client helpers:
- SigV4 signing for R2/S3 endpoints
- Minimal GET/PUT/HEAD + JSON helpers
- Stream-friendly uploads (Node streams -> fetch)
*/

import { createHmac, createHash } from "node:crypto";
import { Readable } from "node:stream";

export type S3ClientConfig = {
  endpoint: string;
  bucket: string;
  region?: string;
  access_key_id: string;
  secret_access_key: string;
  root?: string;
};

export type S3RequestBody =
  | Buffer
  | Uint8Array
  | string
  | NodeJS.ReadableStream;

export type PutObjectRequest = {
  key: string;
  body: S3RequestBody;
  content_type?: string;
  content_length?: number;
  content_hash: string;
};

export type GetObjectRequest = {
  key: string;
};

export type HeadObjectResult = {
  exists: boolean;
  etag?: string;
  size?: number;
};

const EMPTY_HASH =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function formatAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function normalizeRoot(root?: string): string {
  if (!root) return "";
  return root.replace(/^\/+/, "").replace(/\/+$/, "");
}

function buildKey(root: string, key: string): string {
  const cleanKey = key.replace(/^\/+/, "");
  if (!root) return cleanKey;
  return `${root}/${cleanKey}`;
}

type FetchBodyInit = RequestInit["body"];

function toBodyInit(body?: S3RequestBody): FetchBodyInit | undefined {
  if (body == null) return undefined;
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array || body instanceof Buffer) {
    return body;
  }
  if (typeof (body as NodeJS.ReadableStream).pipe === "function") {
    return Readable.toWeb(body as Readable) as unknown as FetchBodyInit;
  }
  return body as unknown as FetchBodyInit;
}

function needsDuplex(body?: FetchBodyInit): boolean {
  if (!body) return false;
  if (typeof body === "string") return false;
  if (body instanceof URLSearchParams) return false;
  if (body instanceof FormData) return false;
  if (body instanceof ArrayBuffer) return false;
  if (ArrayBuffer.isView(body)) return false;
  if (typeof (body as ReadableStream<Uint8Array>).getReader === "function") {
    return true;
  }
  return typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] === "function";
}

function signRequest({
  method,
  url,
  headers,
  payloadHash,
  region,
  accessKeyId,
  secretAccessKey,
}: {
  method: string;
  url: URL;
  headers: Record<string, string>;
  payloadHash: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}): { authorization: string; signed_headers: string } {
  const sortedKeys = Object.keys(headers)
    .map((key) => key.toLowerCase())
    .sort();
  const canonicalHeaders = sortedKeys
    .map((key) => `${key}:${headers[key].trim()}\n`)
    .join("");
  const signedHeaders = sortedKeys.join(";");
  const canonicalRequest = [
    method.toUpperCase(),
    url.pathname,
    url.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const { amzDate, dateStamp } = formatAmzDate(new Date());
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign)
    .digest("hex");
  return {
    signed_headers: signedHeaders,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

export function createS3Client(config: S3ClientConfig) {
  const root = normalizeRoot(config.root);
  const region = config.region ?? "auto";

  function makeUrl(key: string): URL {
    const url = new URL(config.endpoint);
    const fullKey = buildKey(root, key);
    url.pathname = `/${config.bucket}/${encodePath(fullKey)}`;
    return url;
  }

  async function signedFetch({
    method,
    key,
    body,
    contentType,
    contentLength,
    contentHash,
  }: {
    method: string;
    key: string;
    body?: S3RequestBody;
    contentType?: string;
    contentLength?: number;
    contentHash: string;
  }): Promise<Response> {
    const url = makeUrl(key);
    const { amzDate } = formatAmzDate(new Date());
    const headers: Record<string, string> = {
      host: url.host,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": contentHash,
    };
    if (contentType) {
      headers["content-type"] = contentType;
    }
    if (contentLength != null) {
      headers["content-length"] = String(contentLength);
    }
    const bodyInit = toBodyInit(body);
    const { authorization } = signRequest({
      method,
      url,
      headers,
      payloadHash: contentHash,
      region,
      accessKeyId: config.access_key_id,
      secretAccessKey: config.secret_access_key,
    });
    headers.authorization = authorization;
    const init: RequestInit & { duplex?: "half" } = {
      method,
      headers,
    };
    if (bodyInit !== undefined) {
      init.body = bodyInit;
    }
    if (needsDuplex(bodyInit)) {
      init.duplex = "half";
    }
    return await fetch(url, init);
  }

  async function putObject({
    key,
    body,
    content_type,
    content_length,
    content_hash,
  }: PutObjectRequest): Promise<void> {
    const response = await signedFetch({
      method: "PUT",
      key,
      body,
      contentType: content_type,
      contentLength: content_length,
      contentHash: content_hash,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `s3 put failed: ${response.status} ${response.statusText} ${text}`,
      );
    }
  }

  async function getObject({
    key,
  }: GetObjectRequest): Promise<Response> {
    return await signedFetch({
      method: "GET",
      key,
      contentHash: EMPTY_HASH,
    });
  }

  async function headObject(key: string): Promise<HeadObjectResult> {
    const response = await signedFetch({
      method: "HEAD",
      key,
      contentHash: EMPTY_HASH,
    });
    if (response.status === 404) {
      return { exists: false };
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `s3 head failed: ${response.status} ${response.statusText} ${text}`,
      );
    }
    const size = response.headers.get("content-length");
    const etag = response.headers.get("etag") ?? undefined;
    return {
      exists: true,
      etag,
      size: size ? Number(size) : undefined,
    };
  }

  async function getJson<T>(key: string): Promise<T | undefined> {
    const response = await getObject({ key });
    if (response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `s3 get failed: ${response.status} ${response.statusText} ${text}`,
      );
    }
    return (await response.json()) as T;
  }

  async function putJson({
    key,
    value,
  }: {
    key: string;
    value: any;
  }): Promise<void> {
    const body = JSON.stringify(value);
    await putObject({
      key,
      body,
      content_type: "application/json",
      content_length: Buffer.byteLength(body),
      content_hash: sha256Hex(body),
    });
  }

  return {
    putObject,
    getObject,
    headObject,
    getJson,
    putJson,
  };
}
