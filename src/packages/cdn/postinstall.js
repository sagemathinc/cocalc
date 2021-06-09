#!/usr/bin/env node

console.log("Ensuring versioned symlinks exist.");

try {
  const { versions } = require("./dist/index.js");
} catch (err) {
  // versions info doesn't exist yet, e.g., when doing an initial "npm ci".
  process.exit(0);
}

const { statSync, symlinkSync } = require("fs");

for (const pkg in versions) {
  const path = `dist/${pkg}-${versions[pkg]}`;
  try {
    // stat to see if path exists
    statSync(path);
  } catch (_) {
    // it does not, so make link
    console.log(`${path} --> ${pkg}`);
    symlinkSync(pkg, path);
  }
}
