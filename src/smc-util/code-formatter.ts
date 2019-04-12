// common configuration for mapping programming languages (lower case) to formatters
// this is used by webapp and the projectc

// ideally, this is the language, but for historic reasons it's what is being "parsed"
export type Parser =
  | "r"
  | "c"
  | "c++"
  | "clang-format"
  | "latex"
  | "go"
  | "gofmt"
  | "tidy"
  | "html"
  | "html-tidy"
  | "xml-tidy"
  | "bib-biber"
  | "markdown"
  | "babylon"
  | "json"
  | "yaml"
  | "typescript"
  | "postcss"
  | "python"
  | "py";

export type Tool =
  | "prettier" // always available
  | "yapf"
  | "knitr"
  | "formatR"
  | "clang-format"
  | "latexindent"
  | "gofmt"
  | "biber"
  | "tidy";

type Config = { [s in Parser]?: Tool };

// those languages (parser) which aren't handled by "prettier", have these special tools (command-line interface)
export const config: Readonly<Config> = Object.freeze({
  py: "yapf",
  python: "yapf",
  python3: "yapf3",
  r: "formatR",
  c: "clang-format",
  "clang-format": "clang-format",
  "c++": "clang-format",
  latex: "latexindent",
  go: "gofmt",
  gofmt: "gofmt",
  "bib-biber": "biber",
  tidy: "tidy",
  xml: "tidy",
  html: "tidy",
  markdown: "prettier",
  typescript: "prettier",
  postcss: "prettier",
  json: "prettier"
} as Config);

// Map parsers (a subset) to a human-readable language
type Langs = { [s in Parser]?: string };

export const parser2language: Readonly<Langs> = Object.freeze({
  r: "R Language",
  c: "C",
  "c++": "C++",
  latex: "LaTeX",
  "bib-biber": "Bibtex",
  json: "JSON",
  yaml: "YAML",
  postcss: "CSS",
  py: "Python",
  gofmt: "Go",
  markdown: "Markdown",
  typescript: "TypeScript",
  html: "HTML",
  xml: "XML"
} as Langs);

// pre-process mapping of each tool to human-readable language or text type
type Tool4Langs = { [s in Tool]?: string[] };

const t4l: Tool4Langs = {};
for (const parser of Object.keys(config)) {
  const tool = config[parser];
  if (t4l[tool] == null) t4l[tool] = [];
  const lang = parser2language[parser];
  if (lang != null) t4l[tool].push(lang);
}

export const tool4langs: Readonly<Tool4Langs> = Object.freeze(t4l);
