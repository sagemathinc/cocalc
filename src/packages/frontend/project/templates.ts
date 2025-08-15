export function getFileTemplate(ext: string): string {
  return TEMPLATES[ext] ?? "";
}

const TEMPLATES = {
  rnw: String.raw`\documentclass{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{url}
\begin{document}

% learn more about knitr: https://yihui.name/knitr/

<<setup, include=FALSE, cache=FALSE>>=
library(knitr)
opts_chunk$set(cache=TRUE, autodep=TRUE)
options(formatR.arrow=TRUE, width=90)
@

\title{Knitr in CoCalc}

\author{Author Name}

\maketitle

<<summary>>=
x <- c(2,1,7,4,4,5,4,6,4,5,4,3,4,5,1)
summary(x)
@

<<histogram-plot, fig.width=4, fig.height=4, out.width='.5\\linewidth'>>=
hist(x)
@

Sum of \Sexpr{paste(x, collapse="+")} is \Sexpr{sum(x)}.


\end{document}`,
  tex: String.raw`\documentclass{article}

% set font encoding for PDFLaTeX, XeLaTeX, or LuaTeX
\usepackage{ifxetex,ifluatex}
\if\ifxetex T\else\ifluatex T\else F\fi\fi T%
  \usepackage{fontspec}
\else
  \usepackage[T1]{fontenc}
  \usepackage[utf8]{inputenc}
  \usepackage{lmodern}
\fi

\usepackage{hyperref}
\usepackage{amsmath}

\title{Title of Document}
\author{Name of Author}

% Enable SageTeX to run SageMath code right inside this LaTeX file.
% http://doc.sagemath.org/html/en/tutorial/sagetex.html
% \usepackage{sagetex}

% Enable PythonTeX to run Python – https://ctan.org/pkg/pythontex
% \usepackage{pythontex}

\begin{document}
\maketitle





\end{document} 
  
`,
  rtex: String.raw`\documentclass{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{url}
\usepackage{graphicx}

% this is based on https://github.com/yihui/knitr-examples/blob/master/005-latex.Rtex

%% for inline R code: if the inline code is not correctly parsed, you will see a message
\newcommand{\rinline}[1]{SOMETHING WRONG WITH knitr}

\begin{document}

\title{Rtex Knitr in CoCalc}

\author{Author Name}

\maketitle

Boring stuff as usual:

%% a chunk with default options
%% begin.rcode
% 1+1
%
% x=rnorm(5); t(x)
%% end.rcode

For the cached chunk below, you will need to wait for 3 seconds for
the first time you compile this document, but it takes no time the
next time you run it again.

%% chunk options: cache this chunk
%% begin.rcode my-cache, cache=TRUE
% set.seed(123)
% x = runif(10)
% sd(x)  # standard deviation
%
% Sys.sleep(3) # test cache
%% end.rcode

Now we know the first element of x is \rinline{x[1]}.
And we also know the 26 letters are \rinline{LETTERS}.
An expression that returns a value of length 0 will be removed from the output, \rinline{x[1] = 2011; NULL} but it was indeed evaluated,
i.~e. now the first element of x becomes \rinline{x[1]}.

How about figures? Let's use the Cairo PDF device (assumes R $\geq$ 2.14.0).

Warnings, messages and errors are preserved by default.

%% begin.rcode
% sqrt(-1) # here is a warning!
% message('this is a message you should know')
% 1+'a'  # impossible
%% end.rcode

\end{document}
`,
};
