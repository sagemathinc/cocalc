import {
  verifyExtensionArchiveSignature,
  type ExtensionDefinition,
  type VerifiedExtensionArchiveSignature,
} from "@cocalc/sdk";

import { extensionRegistry } from "./registry";
import {
  getExtensionImportModuleUrl,
  loadExtensionImport,
  loadExtensionImports,
  listExtensionImports,
} from "./import-map";

declare const DEBUG: boolean;
const SKIP_BUILTIN_ARCHIVE_CACHE = typeof DEBUG !== "undefined" && DEBUG;

export interface LoadedExtensionBundle {
  bundleUrl: string;
  extension: ExtensionDefinition;
  verification:
    | { mode: "builtin" }
    | {
        mode: "signed";
        digestHex: string;
        supplierId: string;
        supplierName?: string;
      }
    | { mode: "dev-unsigned" };
}

const bundleLoadCache = new Map<string, Promise<LoadedExtensionBundle>>();
const assetUrlCache = new Map<string, Promise<string>>();

const EXTENSION_ASSET_RESOLVER_KEY = Symbol.for(
  "cocalc.sdk.asset-resolver",
);

const EXTENSION_ARCHIVE_DB = "cocalc-sdk-bundles";
const EXTENSION_ARCHIVE_DB_VERSION = 1;
const EXTENSION_ARCHIVE_STORE = "archives";
const EXTENSION_ARCHIVE_BUNDLE_URL_INDEX = "bundleUrl";

interface ExtensionArchiveManifest {
  id?: string;
  version?: string;
  main?: string;
}

interface ExtractedExtensionArchive {
  manifest?: ExtensionArchiveManifest;
  files: Map<string, Uint8Array>;
  mainPath: string;
}

interface StoredExtensionArchive {
  key: string;
  bundleUrl: string;
  extensionId: string;
  version: string;
  mainPath: string;
  files: Array<{ path: string; bytes: ArrayBuffer }>;
}

interface LoadExtensionBundleOptions {
  trust?: "default" | "builtin";
}

interface ExtensionTrustHelpers {
  getTrustedAppSuppliers: typeof import("./trust").getTrustedAppSuppliers;
  shouldSkipExtensionSignatureVerification: typeof import("./trust").shouldSkipExtensionSignatureVerification;
}

async function getExtensionTrustHelpers(): Promise<ExtensionTrustHelpers> {
  const trust = await import("./trust");
  return {
    getTrustedAppSuppliers: trust.getTrustedAppSuppliers,
    shouldSkipExtensionSignatureVerification:
      trust.shouldSkipExtensionSignatureVerification,
  };
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
}

export async function loadExtensionHostModule(
  specifier: string,
): Promise<unknown> {
  return await loadExtensionImport(specifier);
}

export async function loadExtensionHostModules(
  specifiers: string[],
): Promise<Record<string, unknown>> {
  return await loadExtensionImports(specifiers);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rewriteSpecifier(
  source: string,
  specifier: string,
  replacement: string,
): string {
  const escaped = escapeRegExp(specifier);
  return source
    .replace(
      new RegExp(`(from\\s+["'])${escaped}(["'])`, "g"),
      `$1${replacement}$2`,
    )
    .replace(
      new RegExp(`(import\\s*\\(\\s*["'])${escaped}(["']\\s*\\))`, "g"),
      `$1${replacement}$2`,
    )
    .replace(
      new RegExp(`(export\\s+\\*\\s+from\\s+["'])${escaped}(["'])`, "g"),
      `$1${replacement}$2`,
    )
    .replace(
      new RegExp(
        `(export\\s+\\{[^}]+\\}\\s+from\\s+["'])${escaped}(["'])`,
        "g",
      ),
      `$1${replacement}$2`,
    );
}

async function rewriteExtensionBundleImports(source: string): Promise<string> {
  let rewritten = source;
  for (const specifier of listExtensionImports()) {
    const shimUrl = await getExtensionImportModuleUrl(specifier);
    rewritten = rewriteSpecifier(rewritten, specifier, shimUrl);
  }
  return rewritten;
}

function diffRegisteredExtensions(before: Map<string, number>) {
  return extensionRegistry
    .listRegistered()
    .filter(
      ({ definition, registeredAt }) =>
        before.get(definition.id) !== registeredAt,
    )
    .sort((left, right) => right.registeredAt - left.registeredAt);
}

function isArchiveBundleUrl(bundleUrl: string): boolean {
  return /\.zip(?:[?#].*)?$/i.test(bundleUrl);
}

function isZipData(data: Uint8Array): boolean {
  return (
    data.length >= 4 &&
    data[0] === 0x50 &&
    data[1] === 0x4b &&
    data[2] === 0x03 &&
    data[3] === 0x04
  );
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Browser does not support decompression streams");
  }
  const stream = new Blob([toArrayBuffer(data)])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function uint16(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint16(
    offset,
    true,
  );
}

function uint32(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(
    offset,
    true,
  );
}

function normalizeArchivePath(path: string): string {
  return path.replace(/^\.?\/*/, "");
}

function stripCommonArchiveRoot(
  files: Map<string, Uint8Array>,
): Map<string, Uint8Array> {
  const paths = [...files.keys()];
  if (paths.length === 0) {
    return files;
  }
  const firstSegments = new Set<string>();
  for (const path of paths) {
    const firstSlash = path.indexOf("/");
    if (firstSlash <= 0) {
      return files;
    }
    firstSegments.add(path.slice(0, firstSlash));
    if (firstSegments.size > 1) {
      return files;
    }
  }
  const root = [...firstSegments][0];
  if (root == null || root === "") {
    return files;
  }
  return new Map(
    [...files.entries()].map(([path, content]) => [
      normalizeArchivePath(path.slice(root.length + 1)),
      content,
    ]),
  );
}

async function unzip(data: Uint8Array): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  const eocdSignature = 0x06054b50;
  const centralDirectorySignature = 0x02014b50;
  const localHeaderSignature = 0x04034b50;

  let eocdOffset = -1;
  for (let offset = data.length - 22; offset >= 0; offset--) {
    if (uint32(data, offset) === eocdSignature) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error("ZIP archive is missing end-of-central-directory record");
  }

  const centralDirectorySize = uint32(data, eocdOffset + 12);
  const centralDirectoryOffset = uint32(data, eocdOffset + 16);
  let offset = centralDirectoryOffset;
  const encoder = new TextDecoder("utf-8");

  while (offset < centralDirectoryOffset + centralDirectorySize) {
    if (uint32(data, offset) !== centralDirectorySignature) {
      throw new Error("Invalid ZIP central directory entry");
    }
    const compressionMethod = uint16(data, offset + 10);
    const compressedSize = uint32(data, offset + 20);
    const filenameLength = uint16(data, offset + 28);
    const extraLength = uint16(data, offset + 30);
    const commentLength = uint16(data, offset + 32);
    const localHeaderOffset = uint32(data, offset + 42);
    const filename = normalizeArchivePath(
      encoder.decode(data.slice(offset + 46, offset + 46 + filenameLength)),
    );
    offset += 46 + filenameLength + extraLength + commentLength;

    if (filename === "" || filename.endsWith("/")) {
      continue;
    }
    if (uint32(data, localHeaderOffset) !== localHeaderSignature) {
      throw new Error(`Invalid ZIP local header for "${filename}"`);
    }
    const localFilenameLength = uint16(data, localHeaderOffset + 26);
    const localExtraLength = uint16(data, localHeaderOffset + 28);
    const fileStart =
      localHeaderOffset + 30 + localFilenameLength + localExtraLength;
    const fileEnd = fileStart + compressedSize;
    if (fileEnd > data.length) {
      throw new Error(`Truncated ZIP archive entry "${filename}"`);
    }
    const compressed = data.slice(fileStart, fileEnd);
    if (compressionMethod === 0) {
      files.set(filename, compressed);
      continue;
    }
    if (compressionMethod === 8) {
      files.set(filename, await inflateRaw(compressed));
      continue;
    }
    throw new Error(
      `Unsupported ZIP compression method ${compressionMethod} for "${filename}"`,
    );
  }
  return files;
}

function decodeText(data: Uint8Array): string {
  return new TextDecoder("utf-8").decode(data);
}

function guessMimeType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".avif")) return "image/avif";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".css")) return "text/css";
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) {
    return "text/javascript";
  }
  return "application/octet-stream";
}

function archiveKey(extensionId: string, version?: string): string {
  return `${extensionId}@${version ?? "0.0.0"}`;
}

function parseAssetUri(
  uri: string,
): { archiveKey: string; assetPath: string } | undefined {
  const match = uri.match(/^([^/]+\/[^/]+@[^/]+)\/(.+)$/);
  if (match == null) {
    return;
  }
  return {
    archiveKey: match[1],
    assetPath: normalizeArchivePath(match[2]),
  };
}

async function openArchiveDatabase(): Promise<IDBDatabase> {
  return await new Promise((resolve, reject) => {
    const request = indexedDB.open(
      EXTENSION_ARCHIVE_DB,
      EXTENSION_ARCHIVE_DB_VERSION,
    );
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(EXTENSION_ARCHIVE_STORE)
        ? request.transaction?.objectStore(EXTENSION_ARCHIVE_STORE)
        : db.createObjectStore(EXTENSION_ARCHIVE_STORE, { keyPath: "key" });
      if (
        store != null &&
        !store.indexNames.contains(EXTENSION_ARCHIVE_BUNDLE_URL_INDEX)
      ) {
        store.createIndex(EXTENSION_ARCHIVE_BUNDLE_URL_INDEX, "bundleUrl", {
          unique: false,
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withArchiveStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openArchiveDatabase();
  try {
    const transaction = db.transaction(EXTENSION_ARCHIVE_STORE, mode);
    const store = transaction.objectStore(EXTENSION_ARCHIVE_STORE);
    const result = await run(store);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    return result;
  } finally {
    db.close();
  }
}

async function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getStoredArchiveByKey(
  key: string,
): Promise<StoredExtensionArchive | undefined> {
  return await withArchiveStore("readonly", async (store) => {
    return (await requestResult(
      store.get(key) as IDBRequest<StoredExtensionArchive | undefined>,
    )) as StoredExtensionArchive | undefined;
  });
}

async function getStoredArchiveByBundleUrl(
  bundleUrl: string,
): Promise<StoredExtensionArchive | undefined> {
  return await withArchiveStore("readonly", async (store) => {
    const index = store.index(EXTENSION_ARCHIVE_BUNDLE_URL_INDEX);
    return (await requestResult(
      index.get(bundleUrl) as IDBRequest<StoredExtensionArchive | undefined>,
    )) as StoredExtensionArchive | undefined;
  });
}

async function putStoredArchive(record: StoredExtensionArchive): Promise<void> {
  await withArchiveStore("readwrite", async (store) => {
    await requestResult(store.put(record));
  });
}

function extractedArchiveToRecord(
  bundleUrl: string,
  extracted: ExtractedExtensionArchive,
  extension: ExtensionDefinition,
): StoredExtensionArchive {
  const version = extension.version ?? extracted.manifest?.version ?? "0.0.0";
  return {
    key: archiveKey(extension.id, version),
    bundleUrl,
    extensionId: extension.id,
    version,
    mainPath: extracted.mainPath,
    files: [...extracted.files.entries()].map(([path, bytes]) => ({
      path,
      bytes: toArrayBuffer(bytes),
    })),
  };
}

function recordToExtractedArchive(
  record: StoredExtensionArchive,
): ExtractedExtensionArchive {
  return {
    mainPath: record.mainPath,
    files: new Map(
      record.files.map(({ path, bytes }) => [path, new Uint8Array(bytes)]),
    ),
  };
}

async function extractExtensionArchive(
  archiveData: Uint8Array,
): Promise<ExtractedExtensionArchive> {
  const files = stripCommonArchiveRoot(await unzip(archiveData));
  const manifestData = files.get("manifest.json");
  const manifest =
    manifestData == null
      ? undefined
      : (JSON.parse(decodeText(manifestData)) as ExtensionArchiveManifest);
  const mainPath = normalizeArchivePath(manifest?.main ?? "extension.js");
  if (!files.has(mainPath)) {
    throw new Error(`Extension archive is missing main bundle "${mainPath}"`);
  }
  return { manifest, files, mainPath };
}

async function executeBundleSource(
  bundleUrl: string,
  source: string,
): Promise<void> {
  const rewritten = await rewriteExtensionBundleImports(source);
  const moduleUrl = URL.createObjectURL(
    new Blob([rewritten, `\n//# sourceURL=${JSON.stringify(bundleUrl)}\n`], {
      type: "text/javascript",
    }),
  );
  try {
    await import(/* webpackIgnore: true */ moduleUrl);
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
}

async function fetchBundleBytes(bundleUrl: string): Promise<Uint8Array> {
  const response = await fetch(bundleUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to load extension bundle ${bundleUrl}: ${response.status} ${response.statusText}`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function loadArchiveBundle(
  bundleUrl: string,
  extracted?: ExtractedExtensionArchive,
  options: LoadExtensionBundleOptions = {},
): Promise<LoadedExtensionBundle> {
  const before = new Map(
    extensionRegistry
      .listRegistered()
      .map(({ definition, registeredAt }) => [definition.id, registeredAt]),
  );
  // In development, builtins ship with the host and are rebuilt frequently;
  // reading from the IDB cache would keep stale bytes alive across rebuilds.
  // In production, builtins are stable per release, so caching is desirable
  // (faster startup, no network round-trip).
  const cachedArchive =
    options.trust === "builtin" && SKIP_BUILTIN_ARCHIVE_CACHE
      ? undefined
      : await getStoredArchiveByBundleUrl(bundleUrl);
  const archive =
    extracted ??
    (cachedArchive != null
      ? recordToExtractedArchive(cachedArchive)
      : await extractExtensionArchive(await fetchBundleBytes(bundleUrl)));
  const verification = await verifyExtractedArchive(
    bundleUrl,
    archive,
    options,
  );
  await executeBundleSource(
    `${bundleUrl}#${archive.mainPath}`,
    decodeText(archive.files.get(archive.mainPath)!),
  );
  const changed = diffRegisteredExtensions(before);
  const loaded = changed[0];
  if (loaded == null) {
    throw new Error(
      `Extension bundle ${bundleUrl} did not register an extension`,
    );
  }
  await putStoredArchive(
    extractedArchiveToRecord(bundleUrl, archive, loaded.definition),
  );
  return { bundleUrl, extension: loaded.definition, verification };
}

async function loadJavascriptBundle(
  bundleUrl: string,
  bytes?: Uint8Array,
): Promise<LoadedExtensionBundle> {
  const { shouldSkipExtensionSignatureVerification } =
    await getExtensionTrustHelpers();
  if (!shouldSkipExtensionSignatureVerification(bundleUrl)) {
    throw new Error(
      `Unsigned extension JavaScript bundles are only allowed from localhost in developer mode: ${bundleUrl}`,
    );
  }
  const before = new Map(
    extensionRegistry
      .listRegistered()
      .map(({ definition, registeredAt }) => [definition.id, registeredAt]),
  );
  const source = decodeText(bytes ?? (await fetchBundleBytes(bundleUrl)));
  await executeBundleSource(bundleUrl, source);
  const changed = diffRegisteredExtensions(before);
  const loaded = changed[0];
  if (loaded == null) {
    throw new Error(
      `Extension bundle ${bundleUrl} did not register an extension`,
    );
  }
  return {
    bundleUrl,
    extension: loaded.definition,
    verification: { mode: "dev-unsigned" },
  };
}

async function verifyExtractedArchive(
  bundleUrl: string,
  archive: ExtractedExtensionArchive,
  options: LoadExtensionBundleOptions = {},
): Promise<LoadedExtensionBundle["verification"]> {
  if (options.trust === "builtin") {
    return { mode: "builtin" };
  }
  const {
    getTrustedAppSuppliers,
    shouldSkipExtensionSignatureVerification,
  } = await getExtensionTrustHelpers();
  if (shouldSkipExtensionSignatureVerification(bundleUrl)) {
    return { mode: "dev-unsigned" };
  }
  const verified: VerifiedExtensionArchiveSignature =
    await verifyExtensionArchiveSignature({
      files: archive.files,
      trustedSuppliers: getTrustedAppSuppliers(),
    });
  return {
    mode: "signed",
    digestHex: verified.digestHex,
    supplierId: verified.supplier.id,
    supplierName: verified.supplier.name,
  };
}

export async function resolveExtensionAssetUrl(uri: string): Promise<string> {
  const cached = assetUrlCache.get(uri);
  if (cached != null) {
    return await cached;
  }
  const promise = (async () => {
    const parsed = parseAssetUri(uri);
    if (parsed == null) {
      throw new Error(`Invalid extension asset URI "${uri}"`);
    }
    const record = await getStoredArchiveByKey(parsed.archiveKey);
    if (record == null) {
      throw new Error(`Extension archive "${parsed.archiveKey}" is not cached`);
    }
    const asset = record.files.find(({ path }) => path === parsed.assetPath);
    if (asset == null) {
      throw new Error(
        `Extension asset "${parsed.assetPath}" was not found in "${parsed.archiveKey}"`,
      );
    }
    return URL.createObjectURL(
      new Blob([asset.bytes.slice(0)], {
        type: guessMimeType(parsed.assetPath),
      }),
    );
  })();
  assetUrlCache.set(uri, promise);
  try {
    return await promise;
  } catch (err) {
    assetUrlCache.delete(uri);
    throw err;
  }
}

(globalThis as Record<PropertyKey, unknown>)[EXTENSION_ASSET_RESOLVER_KEY] =
  resolveExtensionAssetUrl;

export async function loadExtensionBundle(
  bundleUrl: string,
  options: LoadExtensionBundleOptions = {},
): Promise<LoadedExtensionBundle> {
  const cached = bundleLoadCache.get(bundleUrl);
  if (cached != null) {
    return await cached;
  }
  const promise = (async () => {
    if (isArchiveBundleUrl(bundleUrl)) {
      return await loadArchiveBundle(bundleUrl, undefined, options);
    }
    const bytes = await fetchBundleBytes(bundleUrl);
    if (isZipData(bytes)) {
      return await loadArchiveBundle(
        bundleUrl,
        await extractExtensionArchive(bytes),
        options,
      );
    }
    return await loadJavascriptBundle(bundleUrl, bytes);
  })();
  bundleLoadCache.set(bundleUrl, promise);
  try {
    return await promise;
  } catch (err) {
    bundleLoadCache.delete(bundleUrl);
    throw err;
  }
}

export function registerLoadedExtension(extension: ExtensionDefinition): void {
  extensionRegistry.register(extension);
}
