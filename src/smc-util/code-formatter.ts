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
  | "yapf"
  | "knitr"
| "formatR"
  | "clang-format"
  | "latexindent"
  | "gofmt"
  | "biber";

type Config = { [s in Parser]?: Tool };

// those languages (parser) which aren't handled by "prettier", have these special tools (command-line interface)
export const config: Readonly<Config> = Object.freeze({
  py: "yapf",
  python: "yapf",
  r: "formatR",
  c: "clang-format",
  "clang-format": "clang-format",
  "c++": "clang-format",
  latex: "latexindent",
  go: "gofmt",
  gofmt: "gofmt",
  "bib-biber": "biber"
} as Config);
