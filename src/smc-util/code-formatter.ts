// common configuration for mapping programming languages (lower case) to formatters
// this is used by webapp and the projectc

type FormatterConfig = { [s: string]: string };

export const config: Readonly<FormatterConfig> = Object.freeze({
  python: "yapf",
  r: "knitr",
  c: "clang-format",
  "c++": "clang-format",
  latex: "latexindent",
  go: "gofmt",
  bib: "biber"
});
