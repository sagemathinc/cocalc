// common configuration for mapping programming languages (lower case) to formatters
// this is used by webapp and the projectc

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
  | "tidy"
  | "CSS"
  | "html"
  | "babylon"
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
  | "biber"
  | "tidy"
  | "DOES_NOT_EXIST"; // use this for testing;

// the list of file extensions where we want to have formatting support
export type Exts =
  | "js"
  | "jsx"
  | "md"
  | "rmd"
  | "css"
  | "ts"
  | "tsx"
  | "json"
  | "yaml"
  | "yml"
  | "py"
  | "tex"
  | "html"
  | "r"
  | "go"
  | "c"
  | "cc"
  | "c++"
  | "cpp"
  | "h"
  | "xml"
  | "cml"
  | "kml"
  | "bib";

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
  go: "go",
  c: "clang",
  cc: "clang",
  "c++": "clang",
  cpp: "clang",
  h: "clang",
  xml: "xml",
  cml: "xml",
  kml: "xml",
  bib: "bibtex" // via biber --tool
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
  babylon: "prettier",
  latex: "latexindent",
  go: "gofmt",
  gofmt: "gofmt",
  bibtex: "biber",
  "bib-biber": "biber",
  tidy: "tidy",
  xml: "tidy",
  "xml-tidy": "tidy",
  "html-tidy": "tidy",
  html: "tidy"
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
  markdown: "Markdown",
  typescript: "TypeScript",
  html: "HTML",
  xml: "XML",
  postcss: "CSS",
  javascript: "JavaScript"
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

export const tool4langs: Readonly<Tool2Display> = Object.freeze(t2d);
