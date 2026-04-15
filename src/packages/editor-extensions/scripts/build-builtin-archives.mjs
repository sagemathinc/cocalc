import { gzipSync } from "node:zlib";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const builtinRoot = path.join(packageRoot, "builtin");
const outputRoot = path.join(packageRoot, "dist", "builtin");

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function writeField(buffer, offset, length, value) {
  const content = Buffer.from(value, "utf8");
  content.copy(buffer, offset, 0, Math.min(content.length, length));
}

function writeOctal(buffer, offset, length, value) {
  const octal = value.toString(8).padStart(length - 1, "0");
  writeField(buffer, offset, length, `${octal}\0`);
}

function checksum(header) {
  let sum = 0;
  for (const byte of header) {
    sum += byte;
  }
  return sum;
}

function tarHeader(name, size) {
  const header = Buffer.alloc(512, 0);
  writeField(header, 0, 100, name);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  writeField(header, 156, 1, "0");
  writeField(header, 257, 6, "ustar");
  writeField(header, 263, 2, "00");
  const sum = checksum(header);
  writeField(header, 148, 8, `${sum.toString(8).padStart(6, "0")}\0 `);
  return header;
}

function padToBlock(buffer) {
  const remainder = buffer.length % 512;
  if (remainder === 0) {
    return buffer;
  }
  return Buffer.concat([buffer, Buffer.alloc(512 - remainder, 0)]);
}

function tarGzip(files) {
  const chunks = [];
  for (const { name, data } of files) {
    const content = Buffer.isBuffer(data) ? data : Buffer.from(data);
    chunks.push(tarHeader(name, content.length));
    chunks.push(padToBlock(content));
  }
  chunks.push(Buffer.alloc(1024, 0));
  return gzipSync(Buffer.concat(chunks), { mtime: 0 });
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
  return `${manifest.id.replace(/[\\/]/g, "-")}@${manifest.version}.tar.gz`;
}

function buildBuiltin(builtinName) {
  const sourceDir = path.join(builtinRoot, builtinName);
  const manifestPath = path.join(sourceDir, "manifest.json");
  const extensionPath = path.join(sourceDir, "extension.mjs");
  if (!existsSync(manifestPath) || !existsSync(extensionPath)) {
    throw new Error(
      `Builtin extension "${builtinName}" must define manifest.json and extension.mjs`,
    );
  }

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
  writeFileSync(extensionOut, readFileSync(extensionPath, "utf8"));

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
  writeFileSync(archivePath, tarGzip(archiveFiles));
  return {
    id: manifest.id,
    version: manifest.version,
    filename,
    path: `editor-extensions/${filename}`,
  };
}

rmSync(outputRoot, { force: true, recursive: true });
ensureDir(outputRoot);

const builtins = listBuiltinDirs().map(buildBuiltin);

writeFileSync(
  path.join(outputRoot, "index.json"),
  JSON.stringify({ builtins }, null, 2) + "\n",
);

for (const builtin of builtins) {
  console.log(
    `Built builtin extension archive: ${path.join(outputRoot, builtin.filename)}`,
  );
}
