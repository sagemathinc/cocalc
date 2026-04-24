import { deflateRawSync } from "node:zlib";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

// Modules provided by the CoCalc host at runtime (via the SDK import-map).
// Must be kept in sync with frontend/sdk/import-map.ts BUILTIN_EXTENSION_IMPORTS.
// Extensions must not bundle these; the host shims them in at load time.
const HOST_PROVIDED_MODULES = [
  "react",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/*",
  "antd",
  "antd/*",
  "@cocalc/sdk",
  "@cocalc/sdk/*",
  "@cocalc/conat",
  "@cocalc/util",
  "@cocalc/util/*",
  "@cocalc/frontend/*",
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const builtinRoot = path.join(packageRoot, "builtin");
const outputRoot = path.join(packageRoot, "dist", "builtin");

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function crc32Table() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC32_TABLE = crc32Table();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc = CRC32_TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime() {
  const now = new Date();
  const year = Math.max(1980, now.getUTCFullYear());
  const date =
    ((year - 1980) << 9) | ((now.getUTCMonth() + 1) << 5) | now.getUTCDate();
  const time =
    (now.getUTCHours() << 11) |
    (now.getUTCMinutes() << 5) |
    Math.floor(now.getUTCSeconds() / 2);
  return { date, time };
}

function uint16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
}

function zip(files) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  const { date, time } = dosDateTime();

  for (const { name, data } of files) {
    const filename = Buffer.from(name, "utf8");
    const raw = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const compressed = deflateRawSync(raw);
    const checksum = crc32(raw);

    const localHeader = Buffer.concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(0),
      uint16(8),
      uint16(time),
      uint16(date),
      uint32(checksum),
      uint32(compressed.length),
      uint32(raw.length),
      uint16(filename.length),
      uint16(0),
      filename,
    ]);
    localParts.push(localHeader, compressed);

    const centralHeader = Buffer.concat([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0),
      uint16(8),
      uint16(time),
      uint16(date),
      uint32(checksum),
      uint32(compressed.length),
      uint32(raw.length),
      uint16(filename.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(localOffset),
      filename,
    ]);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localData = Buffer.concat(localParts);
  const endOfCentralDirectory = Buffer.concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(files.length),
    uint16(files.length),
    uint32(centralDirectory.length),
    uint32(localData.length),
    uint16(0),
  ]);

  return Buffer.concat([localData, centralDirectory, endOfCentralDirectory]);
}

function listBuiltinDirs() {
  if (!existsSync(builtinRoot)) {
    return [];
  }
  return readdirSync(builtinRoot).filter((entry) =>
    statSync(path.join(builtinRoot, entry)).isDirectory(),
  );
}

function archiveFilename(manifest) {
  return `${manifest.id.replace(/[\\/]/g, "-")}@${manifest.version}.zip`;
}

const EXTENSION_ENTRY_CANDIDATES = [
  "extension.tsx",
  "extension.ts",
  "extension.mtsx",
  "extension.mts",
  "extension.jsx",
  "extension.js",
  "extension.mjs",
];

function resolveExtensionEntry(sourceDir) {
  for (const candidate of EXTENSION_ENTRY_CANDIDATES) {
    const filename = path.join(sourceDir, candidate);
    if (existsSync(filename)) {
      return filename;
    }
  }
  throw new Error(
    `Builtin extension in "${sourceDir}" must define one of ${EXTENSION_ENTRY_CANDIDATES.join(", ")}`,
  );
}

async function bundleExtensionEntry(extensionPath) {
  const result = await esbuild.build({
    entryPoints: [extensionPath],
    bundle: true,
    write: false,
    format: "esm",
    target: "es2020",
    platform: "browser",
    jsx: "automatic",
    external: HOST_PROVIDED_MODULES,
    logLevel: "silent",
    sourcemap: false,
    minify: false,
  });
  if (result.errors.length > 0) {
    const message = result.errors
      .map((err) => esbuild.formatMessagesSync([err], { kind: "error" }).join(""))
      .join("\n");
    throw new Error(
      `Failed to bundle builtin extension entry "${extensionPath}":\n${message}`,
    );
  }
  return result.outputFiles[0].text;
}

async function buildBuiltin(builtinName) {
  const sourceDir = path.join(builtinRoot, builtinName);
  const manifestPath = path.join(sourceDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Builtin extension "${builtinName}" must define manifest.json`,
    );
  }
  const extensionPath = resolveExtensionEntry(sourceDir);

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const outputDir = path.join(outputRoot, builtinName);
  rmSync(outputDir, { force: true, recursive: true });
  ensureDir(outputDir);

  const manifestOut = path.join(outputDir, "manifest.json");
  const extensionOut = path.join(outputDir, "extension.js");
  writeFileSync(
    manifestOut,
    JSON.stringify(
      {
        ...manifest,
        main: "extension.js",
        source: "builtin",
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(extensionOut, await bundleExtensionEntry(extensionPath));

  const archiveFiles = [
    {
      name: "manifest.json",
      data: readFileSync(manifestOut),
    },
    {
      name: "extension.js",
      data: readFileSync(extensionOut),
    },
  ];

  const assetsDir = path.join(sourceDir, "assets");
  if (existsSync(assetsDir)) {
    cpSync(assetsDir, path.join(outputDir, "assets"), { recursive: true });
    for (const entry of readdirSync(assetsDir)) {
      const assetPath = path.join(assetsDir, entry);
      if (!statSync(assetPath).isFile()) {
        continue;
      }
      archiveFiles.push({
        name: `assets/${entry}`,
        data: readFileSync(assetPath),
      });
    }
  }

  const filename = archiveFilename(manifest);
  const archivePath = path.join(outputRoot, filename);
  writeFileSync(archivePath, zip(archiveFiles));
  return {
    id: manifest.id,
    version: manifest.version,
    filename,
    path: `sdk/${filename}`,
  };
}

rmSync(outputRoot, { force: true, recursive: true });
ensureDir(outputRoot);

const builtins = [];
for (const builtinName of listBuiltinDirs()) {
  builtins.push(await buildBuiltin(builtinName));
}

writeFileSync(
  path.join(outputRoot, "index.json"),
  JSON.stringify({ builtins }, null, 2) + "\n",
);

for (const builtin of builtins) {
  console.log(
    `Built builtin extension archive: ${path.join(outputRoot, builtin.filename)}`,
  );
}
