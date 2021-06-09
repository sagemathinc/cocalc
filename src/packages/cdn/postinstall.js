#!/usr/bin/env node

console.log("Ensuring versioned symlinks exist.");

const { versions } = require("./dist/index.js");

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
