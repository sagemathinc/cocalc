/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// common configuration for mapping programming languages (lower case) to formatters
// this is used by webapp and the project

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
  | "CSS"
  | "html"
  | "xml"
  | "bibtex"
  | "markdown"
  | "Markdown"
  | "Quarto"
  | "knitr"
  | "javascript" // backwards compatibility
  | "json"
  | "JSON"
  | "latex"
  | "yaml"
  | "python"
  | "python3"
  | "zig"
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
  | "rust"
  | "rustfmt" // deprecated, should be rust
  | "tsx"
  | "jsx"
  | "yapf"
  | "yapf3"
  | "formatR"
  | "latexindent"
  | "bib-biber"
  | "xml-tidy"
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
  | "rustfmt"
  | "bib-biber"
  | "prettier" // always available
  | "css" // via prettier
  | "babel" // via prettier
  | "typescript" // via prettier
  | "json" // via prettier
  | "yaml" // via prettier
  | "markdown" // via prettier
  | "html" // via prettier
  | "zig"
  | "DOES_NOT_EXIST"; // use this for testing;

//  the file extensions where we want to have formatting support
export const file_extensions = [
  "bib",
  "c",
  "c++",
  "cc",
  "cml" /* that's xml */,
  "cpp",
  "css",
  "go",
  "h",
  "html",
  "js",
  "json",
  "jsx",
  "kml" /* geodata keyhole markup, also xml */,
  "md",
  "ptx",
  "py",
  "qmd",
  "r",
  "rmd",
  "rs",
  "tex",
  "ts",
  "tsx",
  "xml",
  "xsl",
  "yaml",
  "yml",
  "zig",
] as const;

export const fileExtensionsSet = new Set(file_extensions);

// convert to type
export type Exts = (typeof file_extensions)[number];

// associating filename extensions with a specific type of syntax for a parser
type Ext2Syntax = { [s in Exts]: Parser };
export const ext2syntax: Readonly<Ext2Syntax> = {
  js: "JavaScript",
  jsx: "jsx",
  md: "Markdown",
  rmd: "RMarkdown",
  qmd: "Quarto",
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
  zig: "zig",
  bib: "bibtex", // via biber --tool
} as const;

export const ext2parser = ext2syntax;

// those syntaxes (parser) which aren't handled by "prettier" (the default),
// have these special tools (command-line interface)
// (several ones are added for backwards compatibility)
type SyntaxConfig = { [s in Parser]: Tool };
export const syntax2tool: Readonly<Partial<SyntaxConfig>> = {
  "c++": "clang-format",
  "clang-format": "clang-format",
  babel: "prettier",
  bibtex: "bib-biber",
  c: "clang-format",
  clang: "clang-format",
  CSS: "css", // in prettier
  go: "gofmt",
  gofmt: "gofmt",
  html: "html", // via prettier
  JavaScript: "babel", // in prettier
  json: "json", // in prettier
  JSON: "json", // in prettier
  jsx: "babel", // in prettier
  latex: "latex", // should be "latexindent",
  markdown: "markdown", // in prettier
  Markdown: "markdown", // in prettier
  py: "python", // should be yapf or whatever …
  python: "python", // should be yapf or whatever …
  python3: "python", // should be yapf or whatever …
  Quarto: "markdown", // same as RMarkdown, at least for now
  r: "formatR",
  R: "formatR",
  RMarkdown: "markdown", // same as markdown, at last for now!
  rust: "rustfmt",
  tsx: "typescript", // in prettier
  typescript: "typescript", // in prettier
  TypeScript: "typescript", // in prettier
  xml: "xml-tidy",
  yaml: "yaml", // in prettier
  zig: "zig",
} as const;

export const parser2tool = syntax2tool;

// Map (a subset of) syntax (aka "parser") to a human-readable language
// in order to communicate what syntaxes can be formatted.
type Langs = { [s in Parser]?: string };

export const syntax2display: Readonly<Langs> = {
  "bib-biber": "Bibtex",
  "c++": "C++",
  c: "C",
  css: "CSS",
  gofmt: "Go",
  html: "HTML",
  javascript: "JavaScript",
  JavaScript: "JavaScript",
  json: "JSON",
  latex: "LaTeX",
  markdown: "Markdown",
  py: "Python",
  r: "R Language",
  rust: "Rust",
  typescript: "TypeScript",
  xml: "XML",
  yaml: "YAML",
  zig: "Zig",
} as const;

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

export interface Config {
  syntax: Syntax;
  tabWidth?: number;
  useTabs?: boolean;
  // if given and using syncdoc, wait until our version is at least this new.
  // this ensures we don't format an older version of the document.
  lastChanged?: number;
}

export interface Options extends Omit<Config, "syntax"> {
  parser: Syntax; // TODO refactor this to tool
  tabWidth?: number;
  lastChanged?: number;
}

export interface FormatResult {
  status: "ok" | "error";
  patch?: any;
  phase?: string;
  error?: any;
}
