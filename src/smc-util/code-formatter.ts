/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// common configuration for mapping programming languages (lower case) to formatters
// this is used by webapp and the project

import { tuple } from "./misc2";

// ideally, this is the "syntax", but for historic reasons it's what is being "parsed"
export type Parser =
  | "r"
  | "c"
  | "c++"
  | "clang"
  | "clang-format"
  | "latex"
  | "go"
  | "gofmt"
  | "rust"
  | "rustfmt"
  | "tidy"
  | "CSS"
  | "html"
  | "babel"
  | "html-tidy"
  | "xml"
  | "xml-tidy"
  | "bib-biber"
  | "bibtex"
  | "markdown"
  | "Markdown"
  | "json"
  | "JSON"
  | "yaml"
  | "postcss"
  | "python"
  | "py"
  | "R"
  | "RMarkdown"
  | "TypeScript"
  | "typescript"
  | "JavaScript"
  | "tsx"
  | "jsx";

export type Tool =
  | "prettier" // always available
  | "yapf"
  | "knitr"
  | "formatR"
  | "clang-format"
  | "latexindent"
  | "gofmt"
  | "rustfmt"
  | "biber"
  | "tidy"
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
type Ext2Parser = { [s in Exts]: Parser };
export const ext2parser: Readonly<Ext2Parser> = Object.freeze({
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
  py: "python",
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
  bib: "bibtex", // via biber --tool
} as Ext2Parser);

// those syntaxes (parser) which aren't handled by "prettier" (the default),
// have these special tools (command-line interface)
// (several ones are added for backwards compatibility)
type Config = { [s in Parser]: Tool };
export const parser2tool: Readonly<Config> = Object.freeze({
  py: "yapf",
  python: "yapf",
  python3: "yapf3",
  R: "formatR",
  r: "formatR",
  JavaScript: "prettier",
  jsx: "prettier",
  tsx: "prettier",
  TypeScript: "prettier",
  typescript: "prettier",
  CSS: "prettier",
  postcss: "prettier",
  json: "prettier",
  JSON: "prettier",
  yaml: "prettier",
  markdown: "prettier",
  Markdown: "prettier",
  RMarkdown: "prettier", // same as markdown!
  c: "clang-format",
  clang: "clang-format",
  "clang-format": "clang-format",
  "c++": "clang-format",
  babel: "prettier",
  latex: "latexindent",
  go: "gofmt",
  gofmt: "gofmt",
  rust: "rustfmt",
  rustfmt: "rustfmt",
  bibtex: "biber",
  "bib-biber": "biber",
  tidy: "tidy",
  xml: "tidy",
  "xml-tidy": "tidy",
  "html-tidy": "tidy",
  html: "tidy",
  // html: "DOES_NOT_EXIST"
} as Config);

// Map (a subset of) syntax (aka "parser") to a human-readable language
// in order to communicate what syntaxes can be formatted.
type Langs = { [s in Parser]?: string };

export const parser2display: Readonly<Langs> = Object.freeze({
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
  postcss: "CSS",
  javascript: "JavaScript",
} as Langs);

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

export function format_parser_for_extension(ext: string): Parser {
  let parser: Parser;
  switch (ext) {
    case "js":
    case "jsx":
      parser = "babel";
      break;
    case "json":
      parser = "json";
      break;
    case "ts":
    case "tsx":
      parser = "typescript";
      break;
    case "md":
    case "rmd":
      parser = "markdown";
      break;
    case "css":
      parser = "postcss";
      break;
    case "tex":
      parser = "latex";
      break;
    case "py":
      parser = "python";
      break;
    case "yml":
    case "yaml":
      parser = "yaml";
      break;
    case "r":
      parser = "r";
      break;
    case "go":
      parser = "gofmt";
      break;
    case "rs":
      parser = "rustfmt";
      break;
    case "html":
      parser = "html-tidy";
      break;
    case "xml":
    case "cml":
    case "kml":
      parser = "xml-tidy";
      break;
    case "bib":
      parser = "bib-biber";
      break;
    case "c":
    case "c++":
    case "cc":
    case "cpp":
    case "h":
      parser = "clang-format";
      break;
    default:
      throw Error(`no code formatting support for ${ext}`);
  }
  return parser;
}
