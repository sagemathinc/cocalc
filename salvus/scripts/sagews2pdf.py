#!/usr/bin/env python

MARKERS = {'cell':u"\uFE20", 'output':u"\uFE21"}

import cPickle, json, os, sys

def sagews_to_pdf(filename):
    base = os.path.splitext(filename)[0]
    pdf  = base + ".pdf"
    print "converting: %s --> %s"%(filename, pdf)

class Cell(object):
    def __init__(self, s):
        self.raw = s
        v = s.split('\n' + MARKERS['output'])
        if len(v) > 0:
            w = v[0].split(MARKERS['cell']+'\n')
            self.input_uuid = w[0].lstrip(MARKERS['cell'])
            self.input = w[1]
        else:
            self.input_uuid = self.input = ''
        if len(v) > 1:
            w = v[1].split(MARKERS['output'])
            self.output_uuid = w[0] if len(w) > 0 else ''
            self.output = [json.loads(x) for x in w[1:] if x]
        else:
            self.output = self.output_uuid = ''


    def latex(self):
        return self.latex_input() + self.latex_output()

    def latex_input(self):
        if self.input.strip():
            return "\\begin{lstlisting}\n%s\n\\end{lstlisting}"%self.input
        else:
            return ""

    def latex_output(self):
        s = ''
        for x in self.output:
            if 'stdout' in x:
                s += "\\begin{verbatim}" + x['stdout'] + "\\end{verbatim}"
            if 'stderr' in x:
                s += "{\\color{dredcolor}\\begin{verbatim}" + x['stderr'] + "\\end{verbatim}}"
        return s

class Worksheet(object):
    def __init__(self, filename=None, s=None):
        """
        The worksheet defined by the given filename or UTF unicode string s.
        """
        if filename is not None:
            self._init_from(open(filename).read().decode('utf8'))
        elif s is not None:
            self._init_from(s)
        else:
            raise ValueError("filename or s must be defined")

    def _init_from(self, s):

        self._cells = [Cell(x) for x in s.split('\n'+MARKERS['cell'])]

    def __getitem__(self, i):
        return self._cells[i]

    def __len__(self):
        return len(self._cells)

    def latex_preamble(self,title='',author=''):
        s=r"""
\documentclass{article}

\usepackage{etoolbox}
\makeatletter
\preto{\@verbatim}{\topsep=0pt \partopsep=0pt }
\makeatother\usepackage{fullpage}
\usepackage{listings}
\lstdefinelanguage{Sage}[]{Python}
{morekeywords={True,False,sage,singular},
sensitive=true}
\lstset{
  showtabs=False,
  showspaces=False,
  showstringspaces=False,
  commentstyle={\ttfamily\color{dredcolor}},
  keywordstyle={\ttfamily\color{dbluecolor}\bfseries},
  stringstyle ={\ttfamily\color{dgraycolor}\bfseries},
  backgroundcolor=\color{lightyellow},
  language = Sage,
  basicstyle={\ttfamily},
  aboveskip=1em,
  belowskip=0em,
  %frame=single
}
\usepackage{color}
\definecolor{lightyellow}{rgb}{1,1,.92}
\definecolor{dblackcolor}{rgb}{0.0,0.0,0.0}
\definecolor{dbluecolor}{rgb}{.01,.02,0.7}
\definecolor{dredcolor}{rgb}{0.8,0,0}
\definecolor{dgraycolor}{rgb}{0.30,0.3,0.30}
\definecolor{graycolor}{rgb}{0.35,0.35,0.35}
"""
        s += "\\title{%s}\n"%title
        s += "\\author{%s}\n"%author
        s += "\\begin{document}\n"
        s += "\\maketitle"
        return s


    def latex(self, title='', author=''):
        return self.latex_preamble(title, author) + '\n'.join(c.latex() for c in self._cells) + r"\end{document}"




def parse_sagews(s):
    """
    Given a sagews file as a string s, return a list of cell objects.
    """




if __name__ == "__main__":
    if len(sys.argv) == 1:
        sys.stderr.write("""
Convert a Sagemath Cloud sagews file to a pdf file.

    Usage: %s [path/to/filename.sagews] [path/to/filename2.sagews] ...

Creates corresponding file path/to/filename.sagews, if it doesn't exist.
Also, a data/ directory may be created in the current directory, which contains
the contents of the data path in filename.sws.
"""%sys.argv[0])
        sys.exit(1)

    for path in sys.argv[1:]:
        sagews_to_pdf(path)
