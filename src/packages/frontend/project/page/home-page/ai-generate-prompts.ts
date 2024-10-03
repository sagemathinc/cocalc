import { Ext } from "./ai-generate-examples";

export interface HistoryExample {
  prompt: string;
  content: string;
  filename: string;
}

const TEX_TEMPLATE = `\\documentclass{article}
% set font encoding for PDFLaTeX, XeLaTeX, or LuaTeX
\\usepackage{ifxetex,ifluatex}
\\if\\ifxetex T\\else\\ifluatex T\\else F\\fi\\fi T%
  \\usepackage{fontspec}
\\else
  \\usepackage[T1]{fontenc}
  \\usepackage[utf8]{inputenc}
  \\usepackage{lmodern}
\\fi

\\usepackage{hyperref}
\\usepackage{amsmath}

\\title{Title of Document}
\\author{Name of Author}

\\begin{document}

Hello World!

\\end{document}`;

const RMD_PROMPT = "Plot 100 random numbers using R";
const RMD_FILENAME = "100_random_numbers";
const RMD_TEMPLATE = `---
title: "Random numbers"
output:
  html_document:
    toc: true
    fig_caption: true
    number_sections: true
---

## Generate

\`\`\`{r}
x <- rnorm(100)
\`\`\`

## Plot

Visualizing $x$.

\`\`\`{r}
plot(x)
\`\`\`

`;

const IPYNB_TEMPLATE = `## Assigning a variable

Assign $x$:

\`\`\`
x = 1
\`\`\`

## Printing a variable

Print $x$:

\`\`\`
print(x)
\`\`\`
`;

const IPYNB_SAGEMATH_TEMPLATE = `## Differentiate f(x) = x * sin(x)

Define $f(x) = x \\sin(x)$:

\`\`\`
f(x) = x * sin(x)
\`\`\`

## Differentiate $f(X)$

\`\`\`
show(diff(f, x))
\`\`\`
`;

const MD_TEMPLATE = `# Title

## Markdown text

This is **bold** markdown *text*.

## Formula

This is a typeset formula: $e^{i pi} = -1$.

`;

export const LANG_EXTRA: { [language: string]: string } = {
  python:
    "Prefer using the standard library or the following packages: numpy, matplotlib, pandas, scikit-learn, sympy, scipy, sklearn, seaborn, statsmodels, nltk, tensorflow, pytorch, pymc3, dask, numba, bokeh.",
  r: "Prefer using the standard library or the following packages: tidyverse, tidyr, stringr, dplyr, data.table, ggplot2, car, mgcv, lme4, nlme, randomForest, survival, glmnet.",
  sagemath: "Use functionality in SageMath.",
  julia: "Use function from the standard library only.",
} as const;

export const DEFAULT_LANG_EXTRA = "Prefer using the standard library.";

export const PROMPT: {
  [ext in Ext]: {
    extra: string;
    template: HistoryExample;
  };
} = {
  tex: {
    extra:
      "Change the documentclass or add more packages as needed. Make sure the generated document can be compiled with PDFLaTeX, XeLaTeX, and LuaTeX.",
    template: {
      prompt: "Plain 'article' with the content 'Hello World!'",
      content: TEX_TEMPLATE,
      filename: "plain_article",
    },
  },
  rmd: {
    extra:
      "This document will be processed using RMarkdown to generate HTML output. Wrap formulas in $ or $$ characters.",
    template: {
      prompt: RMD_PROMPT,
      content: RMD_TEMPLATE,
      filename: RMD_FILENAME,
    },
  },
  qmd: {
    extra:
      "This document will be processed using Quarto to generate HTML output. Wrap formulas in $ or $$ characters.",
    template: {
      prompt: RMD_PROMPT,
      content: RMD_TEMPLATE,
      filename: RMD_FILENAME,
    },
  },
  md: {
    extra:
      "This document will be rendered by the browser client. Wrap formulas in $ or $$ characters.",
    template: {
      prompt:
        "A simple document with some headers, text formatting and a formula.",
      content: MD_TEMPLATE,
      filename: "simple",
    },
  },
  ipynb: {
    extra: DEFAULT_LANG_EXTRA,
    template: {
      prompt: "Assign 1 to x and print x.",
      content: IPYNB_TEMPLATE,
      filename: "print_x",
    },
  },
  "ipynb-sagemath": {
    extra: LANG_EXTRA.sagemath,
    template: {
      prompt: "Differentiate f(x) = x * sin(x) and show the result.",
      content: IPYNB_SAGEMATH_TEMPLATE,
      filename: "diff_fx",
    },
  },
} as const;
