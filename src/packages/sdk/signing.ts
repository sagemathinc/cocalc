export interface ExtensionArchiveSignatureFile {
  algorithm: "Ed25519";
  supplierKeyId: string;
  signature: string;
}

export interface TrustedAppSupplier {
  id: string;
  name?: string;
  publicKey: string;
  enabled?: boolean;
}

export interface VerifiedExtensionArchiveSignature {
  digestHex: string;
  signature: ExtensionArchiveSignatureFile;
  supplier: TrustedAppSupplier;
}

function assertNonEmptyString(
  name: string,
  value: unknown,
): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string`);
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeArchivePath(path: string): string {
  return path.replace(/^\.?\/*/, "");
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
}

function base64ToBytes(base64: string): Uint8Array {
  const decoded = globalThis.atob(base64.replace(/\s+/g, ""));
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}

function pemToDer(publicKey: string): ArrayBuffer {
  const base64 = publicKey
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  const bytes = base64ToBytes(base64);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(data));
  return new Uint8Array(digest);
}

export function parseExtensionArchiveSignatureFile(
  value: unknown,
): ExtensionArchiveSignatureFile {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("signature.json must contain an object");
  }
  const raw = value as Record<string, unknown>;
  if (raw.algorithm !== "Ed25519") {
    throw new Error(
      `Unsupported extension signature algorithm "${String(raw.algorithm)}"`,
    );
  }
  assertNonEmptyString("signature.supplierKeyId", raw.supplierKeyId);
  assertNonEmptyString("signature.signature", raw.signature);
  return {
    algorithm: "Ed25519",
    supplierKeyId: raw.supplierKeyId,
    signature: raw.signature,
  };
}

export async function computeExtensionArchiveDigest(
  files: Map<string, Uint8Array>,
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  for (const [path, content] of [...files.entries()]
    .filter(([path]) => normalizeArchivePath(path) !== "signature.json")
    .sort(([left], [right]) => left.localeCompare(right))) {
    const fileDigest = await sha256(content);
    lines.push(`${normalizeArchivePath(path)}\t${bytesToHex(fileDigest)}\n`);
  }
  return await sha256(encoder.encode(lines.join("")));
}

export async function verifyExtensionArchiveSignature({
  files,
  trustedSuppliers,
}: {
  files: Map<string, Uint8Array>;
  trustedSuppliers: TrustedAppSupplier[];
}): Promise<VerifiedExtensionArchiveSignature> {
  if (typeof crypto?.subtle?.verify !== "function") {
    throw new Error("WebCrypto signature verification is not available");
  }
  const rawSignature = files.get("signature.json");
  if (rawSignature == null) {
    throw new Error("Extension archive is missing signature.json");
  }
  const signature = parseExtensionArchiveSignatureFile(
    JSON.parse(new TextDecoder("utf-8").decode(rawSignature)),
  );
  const supplier = trustedSuppliers.find(
    ({ enabled, id }) => enabled !== false && id === signature.supplierKeyId,
  );
  if (supplier == null) {
    throw new Error(
      `Extension supplier "${signature.supplierKeyId}" is not trusted`,
    );
  }
  const digest = await computeExtensionArchiveDigest(files);
  const publicKey = await crypto.subtle.importKey(
    "spki",
    pemToDer(supplier.publicKey),
    "Ed25519",
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify(
    "Ed25519",
    publicKey,
    toArrayBuffer(base64ToBytes(signature.signature)),
    toArrayBuffer(digest),
  );
  if (!ok) {
    throw new Error(
      `Extension archive signature verification failed for supplier "${supplier.id}"`,
    );
  }
  return {
    digestHex: bytesToHex(digest),
    signature,
    supplier,
  };
}
