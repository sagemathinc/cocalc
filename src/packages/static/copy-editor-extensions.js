const { cpSync, existsSync, mkdirSync, rmSync } = require("fs");
const { resolve } = require("path");

const source = resolve(__dirname, "../editor-extensions/dist/builtin");
const target = resolve(__dirname, "dist/editor-extensions");

rmSync(target, { force: true, recursive: true });
mkdirSync(resolve(__dirname, "dist"), { recursive: true });

if (!existsSync(source)) {
  console.log(`No builtin editor extensions to copy from ${source}`);
  process.exit(0);
}

cpSync(source, target, { recursive: true });
console.log(`Copied builtin editor extensions to ${target}`);
