#!/usr/bin/env python

MARKERS = {'cell':u"\uFE20", 'output':u"\uFE21"}

# TODO: this needs to use salvus.project_info() or an environment variable or something!
site = 'https://cloud.sagemath.com'

import argparse, cPickle, json, os, shutil, sys, textwrap, HTMLParser, tempfile

def wrap(s, c=90):
    return '\n'.join(['\n'.join(textwrap.wrap(x, c)) for x in s.splitlines()])

# create a subclass and override the handler methods

class Parser(HTMLParser.HTMLParser):
    def handle_starttag(self, tag, attrs):
        if tag == 'h1':
            self.result += '\\section{'
        elif tag == 'h2':
            self.result += '\\subsection{'
        elif tag == 'h3':
            self.result += '\\subsubsection{'
        elif tag == 'i':
            self.result += '\\textemph{'
        elif tag == 'div':
            self.result += '\n\n{'
        elif tag == 'ul':
            self.result += '\\begin{itemize}'
        elif tag == 'ol':
            self.result += '\\begin{enumerate}'
        elif tag == 'hr':
            self.result += '\n\n' + '-'*80 + '\n\n'  #TODO
        elif tag == 'li':
            self.result += '\\item{'
        elif tag == 'a':
            self.result += '\\url{'
        else:
            self.result += '{'  # fallback

    def handle_endtag(self, tag):
        if tag == 'ul':
            self.result += '\\end{itemize}'
        elif tag == 'ol':
            self.result += '\\end{enumerate}'
        elif tag == 'hr':
            self.result += ''
        else:
            self.result += '}'  # fallback

    def handle_data(self, data):
        self.result += data

def html2tex(doc):
    parser = Parser()
    parser.result = ''
    parser.feed(doc)
    return parser.result

class Cell(object):
    def __init__(self, s):
        self.raw = s
        v = s.split('\n' + MARKERS['output'])
        if len(v) > 0:
            w = v[0].split(MARKERS['cell']+'\n')
            n = w[0].lstrip(MARKERS['cell'])
            self.input_uuid = n[:36]
            self.input_codes = n[36:]
            if len(w) > 1:
                self.input = w[1]
            else:
                self.input = ''
        else:
            self.input_uuid = self.input = ''
        if len(v) > 1:
            w = v[1].split(MARKERS['output'])
            self.output_uuid = w[0] if len(w) > 0 else ''
            self.output = []
            for x in w[1:]:
                try:
                    self.output.append(json.loads(x))
                except ValueError:
                    try:
                        print "**WARNING:** Unable to de-json '%s'"%x
                    except:
                        print "Unable to de-json some output"
        else:
            self.output = self.output_uuid = ''


    def latex(self):
        return self.latex_input() + self.latex_output()

    def latex_input(self):
        if 'i' in self.input_codes:   # hide input
            return "\\begin{lstlisting}\n\\end{lstlisting}"
        if self.input.strip():
            return "\\begin{lstlisting}\n%s\n\\end{lstlisting}"%self.input
        else:
            return ""

    def latex_output(self):
        s = ''
        if 'o' in self.input_codes:  # hide output
            return s
        for x in self.output:
            if 'stdout' in x:
                s += "\\begin{verbatim}" + wrap(x['stdout']) + "\\end{verbatim}"
                #s += "\\begin{lstlisting}" + x['stdout'] + "\\end{lstlisting}"
            if 'stderr' in x:
                s += "{\\color{dredcolor}\\begin{verbatim}" + wrap(x['stderr']) + "\\end{verbatim}}"
                #s += "\\begin{lstlisting}" + x['stderr'] + "\\end{lstlisting}"
            if 'html' in x:
                s += html2tex(x['html'])
            if 'interact' in x:
                pass
            if 'tex' in x:
                val = x['tex']
                if 'display' in val:
                    s += "$$%s$$"%val['tex']
                else:
                    s += "$%s$"%val['tex']
            if 'file' in x:
                val = x['file']
                if 'url' in val:
                    target = val['url']
                    filename = os.path.split(target)[-1]
                else:
                    filename = os.path.split(val['filename'])[-1]
                    target = "%s/blobs/%s?uuid=%s"%(site, filename, val['uuid'])

                base, ext = os.path.splitext(filename)
                ext = ext.lower()[1:]
                if ext in ['jpg', 'png', 'eps', 'pdf', 'svg']:
                    img = ''
                    i = target.find("/raw/")
                    if i != -1:
                        src = os.path.join(os.environ['HOME'], target[i+5:])
                        if os.path.abspath(src) != os.path.abspath(filename):
                            try:
                                shutil.copyfile(src, filename)
                            except Exception, msg:
                                print msg
                        img = filename
                    else:
                        cmd = 'rm "%s"; wget "%s" --output-document="%s"'%(filename, target, filename)
                        print cmd
                        if os.system(cmd) == 0:
                            if ext == 'svg':
                                # hack for svg files; in perfect world someday might do something with vector graphics, see http://tex.stackexchange.com/questions/2099/how-to-include-svg-diagrams-in-latex
                                cmd = 'rm "%s"; convert -antialias -density 150 "%s" "%s"'%(base+'.png',filename,base+'.png')
                                os.system(cmd)
                                filename = base+'.png'
                            img = filename
                    if img:
                        s += '\\includegraphics[width=\\textwidth]{%s}'%img
                    else:
                        s += "(problem loading \\verb|'%s'|)"%filename
                else:
                    if target.startswith('http'):
                        s += '\\url{%s}'%target
                    else:
                        s += '\\begin{verbatim}['+target+']\\end{verbatim}'

        return s

class Worksheet(object):
    def __init__(self, filename=None, s=None):
        """
        The worksheet defined by the given filename or UTF unicode string s.
        """
        self._default_title = ''
        if filename is not None:
            self._default_title = filename
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

    def latex_preamble(self, title='',author='', date='', contents=True):
        title = title.replace('_','\_')
        author = author.replace('_','\_')
        s=r"""
\documentclass{article}
\usepackage{fullpage}
\usepackage{amsmath}
\usepackage{amssymb}
\usepackage{graphicx}
\usepackage{etoolbox}
\usepackage{url}
\usepackage{hyperref}
\makeatletter
\preto{\@verbatim}{\topsep=0pt \partopsep=0pt }
\makeatother
\usepackage{listings}
\lstdefinelanguage{Sage}[]{Python}
{morekeywords={True,False,sage,singular},
sensitive=true}
\lstset{
  showtabs=False,
  showspaces=False,
  showstringspaces=False,
  commentstyle={\ttfamily\color{dbrowncolor}},
  keywordstyle={\ttfamily\color{dbluecolor}\bfseries},
  stringstyle ={\ttfamily\color{dgraycolor}\bfseries},
  backgroundcolor=\color{lightyellow},
  language = Sage,
  basicstyle={\ttfamily},
  aboveskip=1em,
  belowskip=0.1em,
  breaklines=true,
  prebreak = \raisebox{0ex}[0ex][0ex]{\ensuremath{\backslash}},
  %frame=single
}
\usepackage{color}
\definecolor{lightyellow}{rgb}{1,1,.92}
\definecolor{dblackcolor}{rgb}{0.0,0.0,0.0}
\definecolor{dbluecolor}{rgb}{.01,.02,0.7}
\definecolor{dredcolor}{rgb}{1,0,0}
\definecolor{dbrowncolor}{rgb}{0.625,0.3125,0}
\definecolor{dgraycolor}{rgb}{0.30,0.3,0.30}
\definecolor{graycolor}{rgb}{0.35,0.35,0.35}
"""
        s += "\\title{%s}\n"%title
        s += "\\author{%s}\n"%author
        if date:
            s += "\\date{%s}\n"%date
        s += "\\begin{document}\n"
        s += "\\maketitle\n"
        if contents:
            s += "\\tableofcontents\n"
        return s

    def latex(self, title='', author='', date='', contents=True):
        if not title:
            title = self._default_title
        return self.latex_preamble(title=title, author=author, date=date, contents=contents) + '\n'.join(c.latex() for c in self._cells) + r"\end{document}"


def sagews_to_pdf(filename, title='', author='', date='', outfile='', contents=True):
    base = os.path.splitext(filename)[0]
    if not outfile:
        pdf = base + ".pdf"
    else:
        pdf = outfile
    print "converting: %s --> %s"%(filename, pdf)
    W = Worksheet(filename)
    temp = ''
    try:
        temp = tempfile.mkdtemp()
        cur = os.path.abspath('.')
        os.chdir(temp)
        open('tmp.tex','w').write(W.latex(title=title, author=author, date=date, contents=contents).encode('utf8'))
        os.system('pdflatex -interact=nonstopmode tmp.tex')
        if contents:
            os.system('pdflatex -interact=nonstopmode tmp.tex')
        if os.path.exists('tmp.pdf'):
            shutil.move('tmp.pdf',os.path.join(cur, pdf))
            print "Created", os.path.join(cur, pdf)
    finally:
        if temp:
            shutil.rmtree(temp)

if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="convert a sagews worksheet to a pdf file via latex")
    parser.add_argument("filename", help="name of sagews file (required)", type=str)
    parser.add_argument("--author", dest="author", help="author name for printout", type=str, default="")
    parser.add_argument("--title", dest="title", help="title for printout", type=str, default="")
    parser.add_argument("--date", dest="date", help="date for printout", type=str, default="")
    parser.add_argument("--contents", dest="contents", help="include a table of contents 'true' or 'false' (default: true)", type=str, default='true')
    parser.add_argument("--outfile", dest="outfile", help="output filename (defaults to input file with sagews replaced by pdf)", type=str, default="")

    args = parser.parse_args()
    if args.contents == 'true':
        args.contents = True
    else:
        args.contents = False

    sagews_to_pdf(args.filename, title=args.title, author=args.author, outfile=args.outfile, date=args.date, contents=args.contents)
