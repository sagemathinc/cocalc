import { Ext } from "./ai-generate-examples";

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
\\end{document}`;

const RMD_TEMPLATE = `---
title: "Title"
output:
  html_document:
    toc: true
    fig_caption: true
    number_sections: true
---

# Header 1

\`\`\`{r}
x <- rnorm(100)
\`\`\`

## Header 1.2

\`\`\`{r}
plot(x)
\`\`\`

`;

export const PROMPT: { [ext in Ext]: { extra: string; template: string } } = {
  tex: {
    extra:
      "Feel free to change the documentclass or add more packages as needed. Make sure the generated document can be compiled with PDFLaTeX, XeLaTeX, and LuaTeX.",
    template: TEX_TEMPLATE,
  },
  rmd: {
    extra:
      "This document will be processed using RMarkdown and generate HTML output. Modify the template to fit the document description.",
    template: RMD_TEMPLATE,
  },
};

