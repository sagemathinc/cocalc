/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// common configuration for mapping programming languages (lower case) to formatters
// this is used by webapp and the project

import { tuple } from "./misc2";

// ideally, this is the "syntax", but for historic reasons it's what is being called "parsed" and
// hence there there are additional entries for backwards compatibility with older projects.
// this shouldn't be necessary any more and could be removed.
export type Syntax =
  | "r"
  | "c"
  | "c++"
  | "clang"
  | "latex"
  | "go"
  | "rust"
  | "CSS"
  | "html"
  | "xml"
  | "bibtex"
  | "markdown"
  | "Markdown"
  | "knitr"
  | "json"
  | "JSON"
  | "latex"
  | "yaml"
  | "python"
  | "python3"
  | "py"
  | "R"
  | "RMarkdown"
  | "TypeScript"
  | "JavaScript"
  // the ones below are to be eliminated (they're in "Tool")
  | "prettier"
  | "typescript"
  | "css"
  | "babel"
  | "gofmt"
  | "clang-format"
  | "rustfmt"
  | "tsx"
  | "jsx"
  | "yapf"
  | "yapf3"
  | "formatR"
  | "latexindent"
  | "bib-biber"
  | "xml-tidy"
  | "html-tidy"
  | "DOES_NOT_EXIST";

export type Parser = Syntax;

export type Tool =
  | "r" // to be removed
  | "yapf"
  | "yapf3" // for python 3
  | "python" // should be yapf
  | "knitr"
  | "formatR"
  | "clang-format"
  | "latex"
  | "latexindent"
  | "gofmt"
  | "xml-tidy"
  | "html-tidy"
  | "rustfmt"
  | "bib-biber"
  | "prettier" // always available
  | "css" // via prettier
  | "babel" // via prettier
  | "typescript" // via prettier
  | "json" // via prettier
  | "yaml" // via prettier
  | "markdown" // via prettier
  | "DOES_NOT_EXIST"; // use this for testing;

// the set of file extensions where we want to have formatting support
export const file_extensions = tuple([
  "js",
  "jsx",
  "ts",
  "tsx",
  "json",
  "md",
  "css",
  "py",
  "r",
  "rs",
  "go",
  "yml",
  "yaml",
  "xml",
  "cml" /* that's xml */,
  "kml" /* geodata keyhole markup, also xml */,
  "xsl",
  "ptx",
  "c",
  "c++",
  "cc",
  "cpp",
  "h",
  "bib",
]);

// convert to type
export type Exts = typeof file_extensions[number];

// associating filename extensions with a specific type of syntax for a parser
type Ext2Syntax = { [s in Exts]: Parser };
export const ext2syntax: Readonly<Ext2Syntax> = Object.freeze({
  js: "JavaScript",
  jsx: "jsx",
  md: "Markdown",
  rmd: "RMarkdown",
  css: "CSS",
  ts: "TypeScript",
  tsx: "tsx",
  json: "JSON",
  yaml: "yaml",
  yml: "yaml",
  py: "python3",
  tex: "latex",
  html: "html",
  r: "R",
  rs: "rust",
  go: "go",
  c: "clang",
  cc: "clang",
  "c++": "clang",
  cpp: "clang",
  h: "clang",
  xml: "xml",
  cml: "xml",
  kml: "xml",
  xsl: "xml",
  ptx: "xml",
  bib: "bibtex", // via biber --tool
} as Ext2Syntax);

export const ext2parser = ext2syntax;

// those syntaxes (parser) which aren't handled by "prettier" (the default),
// have these special tools (command-line interface)
// (several ones are added for backwards compatibility)
type Config = { [s in Parser]: Tool };
export const syntax2tool: Readonly<Config> = Object.freeze({
  py: "python", // should be yapf or whatever …
  python: "python", // should be yapf or whatever …
  python3: "python", // should be yapf or whatever …
  R: "r", // should be "formatR",
  r: "r", // should be "formatR",
  JavaScript: "babel", // in prettier
  jsx: "babel", // in prettier
  tsx: "typescript", // in prettier
  TypeScript: "typescript", // in prettier
  typescript: "typescript", // in prettier
  CSS: "css", // in prettier
  json: "json", // in prettier
  JSON: "json", // in prettier
  yaml: "yaml", // in prettier
  markdown: "markdown", // in prettier
  Markdown: "markdown", // in prettier
  RMarkdown: "markdown", // same as markdown, at last for now!
  c: "clang-format",
  clang: "clang-format",
  "clang-format": "clang-format",
  "c++": "clang-format",
  babel: "prettier",
  latex: "latex", // should be "latexindent",
  go: "gofmt",
  gofmt: "gofmt",
  rust: "rustfmt",
  rustfmt: "rustfmt",
  bibtex: "bib-biber",
  xml: "xml-tidy",
  html: "html-tidy",
  // html: "DOES_NOT_EXIST"
} as Config);

export const parser2tool = syntax2tool;

// Map (a subset of) syntax (aka "parser") to a human-readable language
// in order to communicate what syntaxes can be formatted.
type Langs = { [s in Parser]?: string };

export const syntax2display: Readonly<Langs> = Object.freeze({
  r: "R Language",
  c: "C",
  "c++": "C++",
  latex: "LaTeX",
  "bib-biber": "Bibtex",
  json: "JSON",
  yaml: "YAML",
  py: "Python",
  gofmt: "Go",
  rust: "Rust",
  rustfmt: "Rust",
  markdown: "Markdown",
  typescript: "TypeScript",
  html: "HTML",
  xml: "XML",
  css: "CSS",
  javascript: "JavaScript",
} as Langs);

export const parser2display = syntax2display;

// pre-process mapping of each tool to human-readable language or text type
type Tool2Display = { [s in Tool]?: string[] };

const t2d: Tool2Display = {};
for (const parser of Object.keys(parser2tool)) {
  const tool = parser2tool[parser];
  if (t2d[tool] == null) t2d[tool] = [];
  const lang = parser2display[parser];
  if (lang != null) t2d[tool].push(lang);
}

for (const tool of Object.keys(t2d)) {
  t2d[tool] = t2d[tool].sort();
}

export const tool2display: Readonly<Tool2Display> = Object.freeze(t2d);
