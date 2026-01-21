/*
Cloudflare Worker for serving share snapshots from R2 with JWT gating.
Routes /share/{share_id}/... to share/{share_id}/... objects in R2 and enforces
authenticated/org scopes using a signed JWT.
*/

type ShareScope = "public" | "unlisted" | "authenticated" | "org";
type ShareObjectType = "latest" | "meta" | "manifest" | "blob" | "artifact";

type R2BucketLike = {
  get: (
    key: string,
    opts?: { range?: { offset: number; length: number } },
  ) => Promise<R2ObjectBodyLike | null>;
  head: (key: string) => Promise<R2ObjectHeadLike | null>;
};

type R2ObjectHeadLike = {
  etag?: string;
  size?: number;
  httpMetadata?: {
    contentType?: string;
    cacheControl?: string;
    contentEncoding?: string;
    contentLanguage?: string;
    contentDisposition?: string;
  };
};

type R2ObjectBodyLike = R2ObjectHeadLike & {
  body: ReadableStream<Uint8Array>;
  range?: { offset: number; length: number };
  text: () => Promise<string>;
};

type ShareMeta = {
  share_id: string;
  scope: ShareScope;
  updated_at: string;
};

type WorkerEnv = Record<string, any> & {
  SHARES_BUCKET?: R2BucketLike;
  SHARE_STATIC_BUCKET?: R2BucketLike;
  SHARE_JWT_SECRET?: string;
  SHARE_JWT_ISSUER?: string;
  SHARE_JWT_AUDIENCE?: string;
  SHARE_PUBLIC_CACHE_MAX_AGE?: string;
  SHARE_PRIVATE_CACHE_MAX_AGE?: string;
  SHARE_META_CACHE_MAX_AGE?: string;
  SHARE_STATIC_CACHE_MAX_AGE?: string;
  SHARE_STATIC_HTML_CACHE_MAX_AGE?: string;
};

type ShareRoute = {
  shareId: string;
  key: string;
  objectType: ShareObjectType;
  region?: string;
};

type ShareViewerRoute = {
  shareId: string;
  region?: string;
};

const DEFAULT_PUBLIC_CACHE_MAX_AGE = 60 * 60 * 24 * 365;
const DEFAULT_META_CACHE_MAX_AGE = 60;
const DEFAULT_PRIVATE_CACHE_MAX_AGE = 60;
const DEFAULT_STATIC_CACHE_MAX_AGE = 60 * 60 * 24 * 365;
const DEFAULT_STATIC_HTML_CACHE_MAX_AGE = 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "Authorization, Range, Content-Type",
  "access-control-expose-headers": "Content-Length, Content-Range, ETag",
};

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return withCors(
        new Response("Method not allowed", {
          status: 405,
          headers: { "cache-control": "no-store" },
        }),
      );
    }

    const pathname = new URL(request.url).pathname;
    const shareRoute = parseShareRoute(pathname);
    if (shareRoute) {
      const bucket = resolveBucket(env, shareRoute.region);
      if (!bucket) {
        return withCors(
          new Response("Share bucket not configured", {
            status: 500,
            headers: { "cache-control": "no-store" },
          }),
        );
      }

      const meta = await loadShareMeta(bucket, shareRoute.shareId);
      if (!meta) {
        return withCors(
          new Response("Share not found", {
            status: 404,
            headers: { "cache-control": "no-store" },
          }),
        );
      }

      const authRequired =
        meta.scope === "authenticated" || meta.scope === "org";
      if (authRequired) {
        const token = extractToken(request);
        if (!token) {
          return withCors(unauthorized("Missing share token"));
        }
        const secret = env.SHARE_JWT_SECRET;
        if (!secret) {
          return withCors(
            new Response("JWT secret not configured", {
              status: 500,
              headers: { "cache-control": "no-store" },
            }),
          );
        }
        const verified = await verifyShareJwt({
          token,
          secret,
          shareId: shareRoute.shareId,
          issuer: env.SHARE_JWT_ISSUER,
          audience: env.SHARE_JWT_AUDIENCE ?? "cocalc-share",
        });
        if (!verified.ok) {
          return withCors(unauthorized(verified.error ?? "Invalid token"));
        }
      }

      const cacheControl = cacheControlFor({
        env,
        scope: meta.scope,
        objectType: shareRoute.objectType,
      });
      const varyAuth = authRequired;

      return withCors(
        await serveObject({
          request,
          bucket,
          key: shareRoute.key,
          cacheControl,
          varyAuth,
        }),
      );
    }

    const viewerRoute = parseShareViewerRoute(pathname);
    if (viewerRoute) {
      const response = await serveShareViewer({ request, env });
      return withCors(response);
    }

    const response = await serveStaticAsset({ request, env });
    return withCors(response);
  },
};

async function serveObject({
  request,
  bucket,
  key,
  cacheControl,
  varyAuth,
}: {
  request: Request;
  bucket: R2BucketLike;
  key: string;
  cacheControl: string;
  varyAuth: boolean;
}): Promise<Response> {
  const rangeHeader = request.headers.get("range");
  let range: { offset: number; length: number } | undefined;
  let head = rangeHeader ? await bucket.head(key) : null;

  if (rangeHeader) {
    if (!head) {
      return notFound();
    }
    range = parseRange(rangeHeader, head.size ?? 0);
    if (!range) {
      return rangeNotSatisfiable(head.size ?? 0);
    }
  }

  if (request.method === "HEAD") {
    head ??= await bucket.head(key);
    if (!head) {
      return notFound();
    }
    const headers = buildHeaders({
      meta: head,
      cacheControl,
      varyAuth,
    });
    return new Response(null, { status: 200, headers });
  }

  const object = await bucket.get(key, range ? { range } : undefined);
  if (!object) {
    return notFound();
  }

  const headers = buildHeaders({
    meta: object,
    cacheControl,
    varyAuth,
  });

  let status = 200;
  if (range && object.range && object.size != null) {
    status = 206;
    const start = object.range.offset;
    const end = start + object.range.length - 1;
    headers.set("content-range", `bytes ${start}-${end}/${object.size}`);
    headers.set("content-length", String(object.range.length));
  }

  return new Response(object.body, { status, headers });
}

function buildHeaders({
  meta,
  cacheControl,
  varyAuth,
}: {
  meta: R2ObjectHeadLike;
  cacheControl: string;
  varyAuth: boolean;
}): Headers {
  const headers = new Headers();
  const http = meta.httpMetadata ?? {};
  if (http.contentType) headers.set("content-type", http.contentType);
  if (http.contentEncoding)
    headers.set("content-encoding", http.contentEncoding);
  if (http.contentLanguage)
    headers.set("content-language", http.contentLanguage);
  if (http.contentDisposition) {
    headers.set("content-disposition", http.contentDisposition);
  }
  if (meta.size != null) headers.set("content-length", String(meta.size));
  if (meta.etag) headers.set("etag", meta.etag);
  headers.set("cache-control", cacheControl);
  if (varyAuth) {
    headers.append("vary", "authorization");
  }
  headers.set("accept-ranges", "bytes");
  return headers;
}

async function serveShareViewer({
  request,
  env,
}: {
  request: Request;
  env: WorkerEnv;
}): Promise<Response> {
  const bucket = env.SHARE_STATIC_BUCKET;
  if (!bucket) {
    return new Response("Share viewer bucket not configured", {
      status: 500,
      headers: { "cache-control": "no-store" },
    });
  }
  const object = await bucket.get("share.html");
  if (!object) {
    return notFound();
  }
  const html = await object.text();
  const patched = injectBaseTag(html, "/");
  const bytes = new TextEncoder().encode(patched);
  const headers = new Headers();
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set(
    "cache-control",
    staticCacheControlFor({ env, key: "share.html" }),
  );
  headers.set("content-length", String(bytes.length));
  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }
  return new Response(patched, { status: 200, headers });
}

async function serveStaticAsset({
  request,
  env,
}: {
  request: Request;
  env: WorkerEnv;
}): Promise<Response> {
  const bucket = env.SHARE_STATIC_BUCKET;
  if (!bucket) {
    return new Response("Share viewer bucket not configured", {
      status: 500,
      headers: { "cache-control": "no-store" },
    });
  }
  const pathname = new URL(request.url).pathname;
  const key = pathname.replace(/^\/+/, "");
  if (!key) {
    return notFound();
  }
  return await serveObject({
    request,
    bucket,
    key,
    cacheControl: staticCacheControlFor({ env, key }),
    varyAuth: false,
  });
}

function parseShareRoute(pathname: string): ShareRoute | null {
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length) return null;

  let region: string | undefined;
  let offset = 0;
  if (parts[0] === "r" && parts.length >= 3) {
    region = parts[1];
    offset = 2;
  }

  let shareId = parts[offset];
  let rest = parts.slice(offset + 1);
  if (shareId === "share" || shareId === "s") {
    shareId = rest[0];
    rest = rest.slice(1);
  }
  if (!shareId || !rest.length) return null;

  const objectType = classifyShareObject(rest);
  if (!objectType) return null;

  return {
    shareId,
    key: `share/${shareId}/${rest.join("/")}`,
    objectType,
    region,
  };
}

function parseShareViewerRoute(pathname: string): ShareViewerRoute | null {
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length) return null;

  let region: string | undefined;
  let offset = 0;
  if (parts[0] === "r" && parts.length >= 3) {
    region = parts[1];
    offset = 2;
  }

  let shareId = parts[offset];
  let rest = parts.slice(offset + 1);
  if (shareId === "share" || shareId === "s") {
    shareId = rest[0];
  }
  if (!shareId || !UUID_RE.test(shareId)) return null;
  return { shareId, region };
}

function classifyShareObject(rest: string[]): ShareObjectType | null {
  const first = rest[0];
  if (first === "latest.json") return "latest";
  if (first === "meta.json") return "meta";
  if (first === "manifests") return "manifest";
  if (first === "blobs") return "blob";
  if (first === "artifacts") return "artifact";
  return null;
}

async function loadShareMeta(
  bucket: R2BucketLike,
  shareId: string,
): Promise<ShareMeta | null> {
  const object = await bucket.get(`share/${shareId}/meta.json`);
  if (!object) return null;
  const raw = await object.text();
  try {
    return JSON.parse(raw) as ShareMeta;
  } catch {
    return null;
  }
}

function resolveBucket(env: WorkerEnv, region?: string): R2BucketLike | null {
  if (region) {
    const key = `SHARES_BUCKET_${region.toUpperCase()}`;
    const candidate = env[key];
    if (candidate) return candidate as R2BucketLike;
  }
  return (env.SHARES_BUCKET as R2BucketLike) ?? null;
}

function cacheControlFor({
  env,
  scope,
  objectType,
}: {
  env: WorkerEnv;
  scope: ShareScope;
  objectType: ShareObjectType;
}): string {
  const publicMaxAge =
    Number(env.SHARE_PUBLIC_CACHE_MAX_AGE) || DEFAULT_PUBLIC_CACHE_MAX_AGE;
  const metaMaxAge =
    Number(env.SHARE_META_CACHE_MAX_AGE) || DEFAULT_META_CACHE_MAX_AGE;
  const privateMaxAge =
    Number(env.SHARE_PRIVATE_CACHE_MAX_AGE) || DEFAULT_PRIVATE_CACHE_MAX_AGE;

  const isPublic = scope === "public" || scope === "unlisted";
  if (objectType === "blob" || objectType === "artifact") {
    return isPublic
      ? `public, max-age=${publicMaxAge}, immutable`
      : `private, max-age=${privateMaxAge}`;
  }
  return isPublic
    ? `public, max-age=${metaMaxAge}`
    : `private, max-age=${privateMaxAge}`;
}

function staticCacheControlFor({
  env,
  key,
}: {
  env: WorkerEnv;
  key: string;
}): string {
  const htmlMaxAge =
    Number(env.SHARE_STATIC_HTML_CACHE_MAX_AGE) ||
    DEFAULT_STATIC_HTML_CACHE_MAX_AGE;
  const assetMaxAge =
    Number(env.SHARE_STATIC_CACHE_MAX_AGE) || DEFAULT_STATIC_CACHE_MAX_AGE;
  if (key.endsWith(".html")) {
    return `public, max-age=${htmlMaxAge}`;
  }
  return `public, max-age=${assetMaxAge}, immutable`;
}

function injectBaseTag(html: string, baseHref: string): string {
  if (/<base\s/i.test(html)) return html;
  const tag = `<base href="${baseHref}">`;
  const headClose = html.indexOf("</head>");
  if (headClose !== -1) {
    return html.slice(0, headClose) + tag + html.slice(headClose);
  }
  const headOpen = html.indexOf("<head>");
  if (headOpen !== -1) {
    return html.replace("<head>", `<head>${tag}`);
  }
  return tag + html;
}

function extractToken(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  const url = new URL(request.url);
  return (
    url.searchParams.get("token") ??
    url.searchParams.get("share_token") ??
    undefined
  );
}

function unauthorized(message: string): Response {
  return new Response(message, {
    status: 401,
    headers: {
      "cache-control": "no-store",
      "www-authenticate": 'Bearer realm="cocalc-share"',
    },
  });
}

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "cache-control": "no-store" },
  });
}

function rangeNotSatisfiable(size: number): Response {
  return new Response("Range not satisfiable", {
    status: 416,
    headers: {
      "cache-control": "no-store",
      "content-range": `bytes */${size}`,
    },
  });
}

function parseRange(
  header: string,
  size: number,
): { offset: number; length: number } | undefined {
  const match = header.match(/^bytes=(\d*)-(\d*)$/i);
  if (!match) return undefined;
  const startRaw = match[1];
  const endRaw = match[2];
  if (!startRaw && !endRaw) return undefined;

  let start = startRaw ? Number(startRaw) : undefined;
  let end = endRaw ? Number(endRaw) : undefined;
  if (Number.isNaN(start) || Number.isNaN(end)) return undefined;

  if (start == null) {
    const suffix = end ?? 0;
    if (!suffix) return undefined;
    if (suffix >= size) {
      return { offset: 0, length: size };
    }
    return { offset: size - suffix, length: suffix };
  }

  if (end == null || end >= size) {
    end = size - 1;
  }
  if (start > end) return undefined;
  return { offset: start, length: end - start + 1 };
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function base64UrlToBytes(input: string): Uint8Array {
  const base = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base.length % 4;
  const padded = pad ? base + "=".repeat(4 - pad) : base;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function base64UrlToJson<T>(input: string): T {
  const bytes = base64UrlToBytes(input);
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text) as T;
}

async function verifyShareJwt({
  token,
  secret,
  shareId,
  issuer,
  audience,
}: {
  token: string;
  secret: string;
  shareId: string;
  issuer?: string;
  audience?: string;
}): Promise<{ ok: boolean; payload?: any; error?: string }> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, error: "Invalid token format" };
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  let header: { alg?: string; typ?: string };
  let payload: any;
  try {
    header = base64UrlToJson(headerB64);
    payload = base64UrlToJson(payloadB64);
  } catch {
    return { ok: false, error: "Invalid token payload" };
  }
  if (header.alg !== "HS256") {
    return { ok: false, error: "Unsupported token algorithm" };
  }

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = toArrayBuffer(base64UrlToBytes(signatureB64));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify("HMAC", key, signature, data);
  if (!ok) {
    return { ok: false, error: "Invalid token signature" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now >= payload.exp) {
    return { ok: false, error: "Token expired" };
  }
  if (payload.nbf && now < payload.nbf) {
    return { ok: false, error: "Token not active" };
  }
  if (issuer && payload.iss && payload.iss !== issuer) {
    return { ok: false, error: "Token issuer mismatch" };
  }
  if (audience && payload.aud) {
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(audience)) {
      return { ok: false, error: "Token audience mismatch" };
    }
  }
  if (payload.share_id && payload.share_id !== shareId) {
    return { ok: false, error: "Token share mismatch" };
  }

  return { ok: true, payload };
}
