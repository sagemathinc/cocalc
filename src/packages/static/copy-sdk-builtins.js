const { cpSync, existsSync, mkdirSync, rmSync } = require("fs");
const { resolve } = require("path");

const source = resolve(__dirname, "../sdk/dist/builtin");
const target = resolve(__dirname, "dist/sdk");

rmSync(target, { force: true, recursive: true });
mkdirSync(resolve(__dirname, "dist"), { recursive: true });

if (!existsSync(source)) {
  console.log(`No builtin SDK bundles to copy from ${source}`);
  process.exit(0);
}

cpSync(source, target, { recursive: true });
console.log(`Copied builtin SDK bundles to ${target}`);
