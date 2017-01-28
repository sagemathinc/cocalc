#!/usr/bin/env python
# -*- coding: utf-8 -*-
###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

"""
Copyright (c) 2014 -- 2016   SageMath, Inc..

All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

CONTRIBUTORS:

  - William Stein   - maintainer and initial author
  - Cedric Sodhi    - internationalization and bug fixes
  - Tomas Kalvoda   - internationalization
  - Harald Schilly  - inkscape svg2pdf, ThreadPool, bug fixes, ...

"""

MARKERS = {'cell':u"\uFE20", 'output':u"\uFE21"}

# ATTN styles have to start with a newline
STYLES = {
'classic': r"""
\documentclass{article}
\usepackage{fullpage}
\usepackage[utf8x]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{amsmath}
\usepackage{amssymb}
""",

'modern': r"""
\documentclass[
    paper=A4,
    pagesize,
    fontsize=11pt,
    %headings=small,
    titlepage=false,
    fleqn,
    toc=flat,
    bibliography=totoc, %totocnumbered,
    index=totoc,
    listof=flat]{scrartcl}
\usepackage{scrhack}
\setuptoc{toc}{leveldown}

\usepackage[utf8x]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{xltxtra}  % xelatex

\usepackage[
    left=3cm,
    right=2cm,
    top=2cm,
    bottom=2cm,
    includeheadfoot]{geometry}
\usepackage[automark,headsepline,ilines,komastyle]{scrpage2}
\pagestyle{scrheadings}

\usepackage{fixltx2e}

\raggedbottom

% font tweaks
\usepackage{ellipsis,ragged2e,marginnote}
\usepackage{inconsolata}
\renewcommand{\familydefault}{\sfdefault}
\setkomafont{sectioning}{\normalcolor\bfseries}
\setkomafont{disposition}{\normalcolor\bfseries}

\usepackage{mathtools}
\mathtoolsset{showonlyrefs=true}
\usepackage{amssymb}
\usepackage{sfmath}
"""
}

COMMON = r"""
\usepackage[USenglish]{babel}
\usepackage{etoolbox}
\usepackage{url}
\usepackage{hyperref}

% use includegraphics directly, but beware, that this is actually ...
\usepackage{graphicx}
% ... adjust box! http://latex-alive.tumblr.com/post/81481408449
\usepackage[Export]{adjustbox}
\adjustboxset{max size={\textwidth}{0.7\textheight}}

\usepackage{textcomp}
\def\leftqquote{``}\def\rightqqoute{''}
\catcode`\"=13
\def"{\bgroup\def"{\rightqqoute\egroup}\leftqquote}

\makeatletter
\preto{\@verbatim}{\topsep=0pt \partopsep=0pt }
\makeatother

\usepackage{color}
\definecolor{midgray}{rgb}{0.5,0.5,0.5}
\definecolor{lightyellow}{rgb}{1,1,.92}
\definecolor{dblackcolor}{rgb}{0.0,0.0,0.0}
\definecolor{dbluecolor}{rgb}{.01,.02,0.7}
\definecolor{dredcolor}{rgb}{1,0,0}
\definecolor{dbrowncolor}{rgb}{0.625,0.3125,0}
\definecolor{dgraycolor}{rgb}{0.30,0.3,0.30}
\definecolor{graycolor}{rgb}{0.35,0.35,0.35}

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
  numberstyle ={\tiny\color{midgray}},
  backgroundcolor=\color{lightyellow},
  language = Sage,
  basicstyle={\ttfamily},
  extendedchars=true,
  keepspaces=true,
  aboveskip=1em,
  belowskip=0.1em,
  breaklines=true,
  prebreak = \raisebox{0ex}[0ex][0ex]{\ensuremath{\backslash}},
  %frame=single
}

% sagemath macros
\newcommand{\Bold}[1]{\mathbb{#1}}
\newcommand{\ZZ}{\Bold{Z}}
\newcommand{\NN}{\Bold{N}}
\newcommand{\RR}{\Bold{R}}
\newcommand{\CC}{\Bold{C}}
\newcommand{\FF}{\Bold{F}}
\newcommand{\QQ}{\Bold{Q}}
\newcommand{\QQbar}{\overline{\QQ}}
\newcommand{\CDF}{\Bold{C}}
\newcommand{\CIF}{\Bold{C}}
\newcommand{\CLF}{\Bold{C}}
\newcommand{\RDF}{\Bold{R}}
\newcommand{\RIF}{\Bold{I} \Bold{R}}
\newcommand{\RLF}{\Bold{R}}
\newcommand{\CFF}{\Bold{CFF}}
\newcommand{\GF}[1]{\Bold{F}_{#1}}
\newcommand{\Zp}[1]{\ZZ_{#1}}
\newcommand{\Qp}[1]{\QQ_{#1}}
\newcommand{\Zmod}[1]{\ZZ/#1\ZZ}
"""

# this is part of the preamble above, although this time full of utf8 chars
COMMON += ur"""
% mathjax has \lt and \gt
\newcommand{\lt}{<}
\newcommand{\gt}{>}
% also support HTML's &le; and &ge;
\newcommand{\lequal}{≤}
\newcommand{\gequal}{≥}
\newcommand{\notequal}{≠}

% defining utf8 characters for listings
\lstset{literate=
  {á}{{\'a}}1 {é}{{\'e}}1 {í}{{\'i}}1 {ó}{{\'o}}1 {ú}{{\'u}}1
  {Á}{{\'A}}1 {É}{{\'E}}1 {Í}{{\'I}}1 {Ó}{{\'O}}1 {Ú}{{\'U}}1
  {à}{{\`a}}1 {è}{{\`e}}1 {ì}{{\`i}}1 {ò}{{\`o}}1 {ù}{{\`u}}1
  {À}{{\`A}}1 {È}{{\'E}}1 {Ì}{{\`I}}1 {Ò}{{\`O}}1 {Ù}{{\`U}}1
  {ä}{{\"a}}1 {ë}{{\"e}}1 {ï}{{\"i}}1 {ö}{{\"o}}1 {ü}{{\"u}}1
  {Ä}{{\"A}}1 {Ë}{{\"E}}1 {Ï}{{\"I}}1 {Ö}{{\"O}}1 {Ü}{{\"U}}1
  {â}{{\^a}}1 {ê}{{\^e}}1 {î}{{\^i}}1 {ô}{{\^o}}1 {û}{{\^u}}1
  {Â}{{\^A}}1 {Ê}{{\^E}}1 {Î}{{\^I}}1 {Ô}{{\^O}}1 {Û}{{\^U}}1
  {œ}{{\oe}}1 {Œ}{{\OE}}1 {æ}{{\ae}}1 {Æ}{{\AE}}1 {ß}{{\ss}}1
  {ã}{{\~a}}1 {Ã}{{\~A}}1 {õ}{{\~o}}1 {Õ}{{\~O}}1
  {ç}{{\c c}}1 {Ç}{{\c C}}1 {ø}{{\o}}1 {å}{{\r a}}1 {Å}{{\r A}}1
  {€}{{\EUR}}1 {£}{{\pounds}}1
}

"""

FOOTER = """
%sagemathcloud={"latex_command":"xelatex -synctex=1 -interact=nonstopmode 'tmp.tex'"}
"""

# TODO: this needs to use salvus.project_info() or an environment variable or something!
site = 'https://cloud.sagemath.com'

import argparse, base64, cPickle, json, os, shutil, sys, textwrap, HTMLParser, tempfile, urllib
from uuid import uuid4

def escape_path(s):
    # see http://stackoverflow.com/questions/946170/equivalent-javascript-functions-for-pythons-urllib-quote-and-urllib-unquote
    s = urllib.quote(unicode(s).encode('utf-8'), safe='~@#$&()*!+=:;,.?/\'')
    return s.replace('#','%23').replace("?",'%3F')

def wrap(s, c=90):
    return '\n'.join(['\n'.join(textwrap.wrap(x, c)) for x in s.splitlines()])

# used in texifyHTML and then again, in tex_escape
# they're mapped to macros, defined in the latex preamble
relational_signs = [
    ('gt', 'gt'),
    ('lt', 'lt'),
    ('ge', 'gequal'),
    ('le', 'lequal'),
    ('ne', 'notequal')
]

def tex_escape(s):
    replacements = [
        ('\\',                 '{\\textbackslash}'),
        ('_',                  r'\_'),
        ('^',                  r'\^'),
        (r'{\textbackslash}$', r'\$' ),
        ('%',                  r'\%'),
        ('#',                  r'\#'),
        ('&',                  r'\&'),
    ]
    for rep in replacements:
        s = s.replace(*rep)
    for rel in relational_signs:
        a, b = r'{\textbackslash}%s' % rel[1], r'\%s ' % rel[1]
        s = s.replace(a, b)
    return s


# Parallel computing can be useful for IO bound tasks.
def thread_map(callable, inputs, nb_threads = 1):
    """
    Computing [callable(args) for args in inputs]
    in parallel using `nb_threads` separate *threads* (default: 2).

    This helps a bit with I/O bound tasks and is rather conservative
    to avoid excessive memory usage.

    If an exception is raised by any thread, a RuntimeError exception
    is instead raised.
    """
    print "Doing the following in parallel:\n%s"%('\n'.join(inputs))
    from multiprocessing.pool import ThreadPool
    tp = ThreadPool(nb_threads)
    exceptions = []
    def callable_wrap(x):
        try:
            return callable(x)
        except Exception, msg:
            exceptions.append(msg)
    results = tp.map(callable_wrap, inputs)
    if len(exceptions) > 0:
        raise RuntimeError(exceptions[0])
    return results


# create a subclass and override the handler methods

class Parser(HTMLParser.HTMLParser):
    def __init__(self, cmds):
        HTMLParser.HTMLParser.__init__(self)
        self.result = ''
        self._commands = cmds
        self._dont_close_img = False

    def handle_starttag(self, tag, attrs):
        if tag == 'h1':
            self.result += '\\section{'
        elif tag == 'h2':
            self.result += '\\subsection{'
        elif tag == 'h3':
            self.result += '\\subsubsection{'
        elif tag == 'i':
            self.result += '\\textemph{'
        elif tag == 'div' or tag == 'p':
            self.result += '\n\n{'
        elif tag == 'ul':
            self.result += '\\begin{itemize}'
        elif tag == 'ol':
            self.result += '\\begin{enumerate}'
        elif tag == 'hr':
            # self.result += '\n\n' + '-'*80 + '\n\n'
            self.result += '\n\n' + r'\noindent\makebox[\linewidth]{\rule{\textwidth}{0.4pt}}' + '\n\n'
        elif tag == 'li':
            self.result += '\\item{'
        elif tag == 'strong':
            self.result += '\\textbf{'
        elif tag == 'em':
            self.result += '\\textit{'
        elif tag == 'a':
            attrs = dict(attrs)
            if 'href' in attrs:
                self.result += '\\href{%s}{' % attrs['href']
            else:
                self.result += '\\url{'
        elif tag == 'img':
            attrs = dict(attrs)
            if "src" in attrs:
                href = attrs['src']
                _, ext = os.path.splitext(href)
                ext = ext.lower()
                if '?' in ext:
                    ext = ext[:ext.index('?')]
                # create a deterministic filename based on the href
                from hashlib import sha1
                base = sha1(href).hexdigest()
                filename = base + ext

                # href might start with /blobs/ or similar for e.g. octave plots
                # in such a case, there is also a file output and we ignore the image in the html
                if href[0] == '/':
                    self._dont_close_img = True
                    return
                else:
                    href_download = href

                c = "rm -f '%s'; wget '%s' --output-document='%s'"%(filename, href_download, filename)
                if ext == '.svg':
                    # convert to pdf
                    c += " && rm -f '%s'; inkscape --without-gui --export-pdf='%s' '%s'" % (base+'.pdf',base+'.pdf',filename)
                    filename = base+'.pdf'
                self._commands.append(c)
                # the choice of 120 is "informed" but also arbitrary
                # besides that, if we scale it in sagews, we also have to scale it here
                scaling = 1.
                if 'smc-image-scaling' in attrs:
                    try:
                        # in practice (and if it is set at all) it is most likely 0.66
                        scaling = float(attrs['smc-image-scaling'])
                    except:
                        pass
                resolution = int(120. / scaling)
                self.result += '\\includegraphics[resolution=%s]{%s}'%(resolution, filename)
                # alternatively, implicit scaling by adjbox and textwidth
                # self.result += '\\includegraphics{%s}'%(filename)
            else:
                # fallback, because there is no src='...'
                self.result += '\\verbatim{image: %s}' % str(attrs)
        else:
            self.result += '{'  # fallback

    def handle_endtag(self, tag):
        if tag == 'ul':
            self.result += '\\end{itemize}'
        elif tag == 'ol':
            self.result += '\\end{enumerate}'
        elif tag == 'hr':
            self.result += ''
        elif tag == 'img' and self._dont_close_img:
            self._dont_close_img = False
            self.result += ''
        else:
            self.result += '}'  # fallback

    def handle_data(self, data):
        # safe because all math stuff has already been escaped.
        # print "handle_data:", data
        self.result += tex_escape(data)

def sanitize_math_input(s):
    from markdown2Mathjax import sanitizeInput
    # it's critical that $$ be first!
    delims = [('$$','$$'), ('\\(','\\)'), ('\\[','\\]'),
              ('\\begin{equation}', '\\end{equation}'), ('\\begin{equation*}', '\\end{equation*}'),
              ('\\begin{align}', '\\end{align}'), ('\\begin{align*}', '\\end{align*}'),
              ('\\begin{eqnarray}', '\\end{eqnarray}'), ('\\begin{eqnarray*}', '\\end{eqnarray*}'),
              ('\\begin{math}', '\\end{math}'),
              ('\\begin{displaymath}', '\\end{displaymath}')
              ]

    tmp = [((s,None),None)]
    for d in delims:
        tmp.append((sanitizeInput(tmp[-1][0][0], equation_delims=d), d))

    return tmp

def reconstruct_math(s, tmp):
    print "s ='%r'"%s
    print "tmp = '%r'"%tmp
    from markdown2Mathjax import reconstructMath
    while len(tmp) > 1:
        s = reconstructMath(s, tmp[-1][0][1], equation_delims=tmp[-1][1])
        del tmp[-1]
    return s

def texifyHTML(s):
    replacements = [
        ('&#8220;',            '``'),
        ('&#8221;',            "''"),
        ('&#8217;',            "'"),
        ('&amp;',              "&"),
    ]
    for rep in replacements:
        s = s.replace(*rep)
    for rel in relational_signs:
        a, b = '&%s;' % rel[0], r'\%s' % rel[1]
        s = s.replace(a, b)
    return s

def html2tex(doc, cmds):
    doc = texifyHTML(doc)
    tmp = sanitize_math_input(doc)
    parser = Parser(cmds)
    # The number of (unescaped) dollars or double-dollars found so far. An even
    # number is assumed to indicate that we're outside of math and thus need to
    # escape.
    parser.dollars_found = 0
    parser.feed(tmp[-1][0][0])
    return reconstruct_math(parser.result, tmp)


def md2html(s):
    from markdown2 import markdown
    extras = ['code-friendly', 'footnotes', 'smarty-pants', 'wiki-tables', 'fenced-code-blocks']

    tmp = sanitize_math_input(s)
    markedDownText = markdown(tmp[-1][0][0], extras=extras)
    return reconstruct_math(markedDownText, tmp)

def md2tex(doc, cmds):
    x = md2html(doc)
    #print "-" * 100
    #print "md2html:", x
    #print "-" * 100
    y = html2tex(x, cmds)
    #print "html2tex:", y
    #print "-" * 100
    return y

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
                if x:
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
        """
        Returns the latex represenation of this cell along with a list of commands
        that should be executed in the shell in order to obtain remote data files,
        etc., to render this cell.
        """
        self._commands = []
        return self.latex_input() + self.latex_output(), self._commands

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
            if 'stderr' in x:
                s += "{\\color{dredcolor}\\begin{verbatim}" + wrap(x['stderr']) + "\\end{verbatim}}"
            if 'code' in x:
                # TODO: for now ignoring that not all code is Python...
                s += "\\begin{lstlisting}" + x['code']['source'] + "\\end{lstlisting}"
            if 'html' in x:
                s += html2tex(x['html'], self._commands)
            if 'md' in x:
                s += md2tex(x['md'], self._commands)
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
                    target = "%s/blobs/%s?uuid=%s"%(site, escape_path(filename), val['uuid'])

                base, ext = os.path.splitext(filename)
                ext = ext.lower()[1:]
                # print "latex_output ext", ext
                if ext in ['jpg', 'jpeg', 'png', 'eps', 'pdf', 'svg']:
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
                        # Get the file from remote server
                        c = "rm -f '%s'; wget '%s' --output-document='%s'"%(filename, target, filename)
                        # If we succeeded, convert it to a png, which is what we can easily embed
                        # in a latex document (svg's don't work...)
                        self._commands.append(c)
                        if ext == 'svg':
                            # hack for svg files; in perfect world someday might do something with vector graphics,
                            # see http://tex.stackexchange.com/questions/2099/how-to-include-svg-diagrams-in-latex
                            # Now we live in a perfect world, and proudly introduce inkscape as a dependency for SMC :-)
                            #c += ' && rm -f "%s"; convert -antialias -density 150 "%s" "%s"'%(base+'.png',filename,base+'.png')
                            # converts the svg file into pdf
                            c += " && rm -f '%s'; inkscape --without-gui --export-pdf='%s' '%s'" % (base+'.pdf',base+'.pdf',filename)
                            self._commands.append(c)
                            filename = base+'.pdf'
                        img = filename
                    # omitting [width=\\textwidth] allows figsize to set displayed size
                    # see https://github.com/sagemathinc/smc/issues/114
                    s += '{\\centering\n\\includegraphics{%s}\n\\par\n}\n'%img
                elif ext == 'sage3d' and 'sage3d' in extra_data and 'uuid' in val:
                    # render a static image, if available
                    v = extra_data['sage3d']
                    #print "KEYS", v.keys()
                    uuid = val['uuid']
                    if uuid in v:
                        #print "TARGET acquired!"
                        data = v[uuid].pop()
                        width = min(1, 1.2*data.get('width',0.5))
                        #print "width = ", width
                        if 'data-url' in data:
                            data_url = data['data-url']  # 'data:image/png;base64,iVBOR...'
                            i = data_url.find('/')
                            j = data_url.find(";")
                            k = data_url.find(',')
                            image_ext  = data_url[i+1:j]
                            image_data = data_url[k+1:]
                            assert data_url[j+1:k] == 'base64'
                            filename = str(uuid4()) + "." + image_ext
                            open(filename, 'w').write(base64.b64decode(image_data))
                            s += '\\includegraphics[width=%s\\textwidth]{%s}\n'%(width, filename)

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
        if filename:
            self._filename = os.path.abspath(filename)
        else:
            self._filename = None
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

    def latex_preamble(self, title='',author='', date='', style='modern', contents=True):
        # The utf8x instead of utf8 below is because of http://tex.stackexchange.com/questions/83440/inputenc-error-unicode-char-u8-not-set-up-for-use-with-latex, which I needed due to approx symbols, etc. causing trouble.
        #\usepackage{attachfile}
        from datetime import datetime
        top = '% generated by smc-sagews2pdf -- {timestamp}'
        top = top.format(timestamp=str(datetime.utcnow()))
        s = top + STYLES[style]
        s += COMMON
        s += r"\title{%s}"%tex_escape(title) + "\n"
        s += r"\author{%s}"%tex_escape(author) + "\n"
        if date:
            s += r"\date{%s}"%tex_escape(date) + "\n"
        s += "\\begin{document}\n"
        s += "\\maketitle\n"
        #if self._filename:
        #    s += "The Worksheet: \\attachfile{%s}\n\n"%self._filename

        if contents:
            s += "\\tableofcontents\n"
        return s

    def latex(self, title='', author='', date='', style='modern', contents=True):
        if not title:
            title = self._default_title
        commands = []
        tex = []
        for c in self._cells:
            t, cmd = c.latex()
            tex.append(t)
            if cmd:
                commands.extend(cmd)
        if commands:
            thread_map(os.system, commands)
        return self.latex_preamble(title=title,
                                   author=author,
                                   date=date,
                                   style=style,
                                   contents=contents) \
               + '\n'.join(tex) \
               + r"\end{document}" \
               + FOOTER


def sagews_to_pdf(filename, title='', author='', date='', outfile='', contents=True, remove_tmpdir=True, work_dir=None, style='modern'):
    base = os.path.splitext(filename)[0]
    if not outfile:
        pdf = base + ".pdf"
    else:
        pdf = outfile
    print "converting: %s --> %s"%(filename, pdf)
    W = Worksheet(filename)
    try:
        if work_dir is None:
            work_dir = tempfile.mkdtemp()
        else:
            if not os.path.exists(work_dir):
                os.makedirs(work_dir)
        if not remove_tmpdir:
            print "Temporary directory retained: %s" % work_dir
        cur = os.path.abspath('.')
        os.chdir(work_dir)
        from codecs import open
        open('tmp.tex', 'w', 'utf8').write(
            W.latex(title=title,
                    author=author,
                    date=date,
                    contents=contents,
                    style=style)
        )#.encode('utf8'))
        from subprocess import check_call
        check_call('latexmk -pdf -xelatex -f -interaction=nonstopmode tmp.tex', shell=True)
        if os.path.exists('tmp.pdf'):
            shutil.move('tmp.pdf',os.path.join(cur, pdf))
            print "Created", os.path.join(cur, pdf)
    finally:
        if work_dir and remove_tmpdir:
            shutil.rmtree(work_dir)
        else:
            print "Leaving latex files in '%s'"%work_dir

def main():
    global extra_data

    parser = argparse.ArgumentParser(description="convert a sagews worksheet to a pdf file via latex")
    parser.add_argument("filename", nargs='+', help="name of sagews file (required)", type=str)
    parser.add_argument("--author", dest="author", help="author name for printout", type=str, default="")
    parser.add_argument("--title", dest="title", help="title for printout", type=str, default="")
    parser.add_argument("--date", dest="date", help="date for printout", type=str, default="")
    parser.add_argument("--contents", dest="contents", help="include a table of contents 'true' or 'false' (default: 'true')", type=str, default='true')
    parser.add_argument("--outfile", dest="outfile", help="output filename (defaults to input file with sagews replaced by pdf)", type=str, default="")
    parser.add_argument("--remove_tmpdir", dest="remove_tmpdir", help="if 'false' do not delete the temporary LaTeX files and print name of temporary directory (default: 'true')", type=str, default='true')
    parser.add_argument("--work_dir", dest="work_dir", help="if set, then this is used as the working directory where the tex files are generated and it won't be deleted like the temp dir.")
    parser.add_argument('--subdir', dest="subdir", help="if set, the work_dir will be set (or overwritten) to be pointing to a subdirectory named after the file to be converted.", default='false')
    parser.add_argument("--extra_data_file", dest="extra_data_file", help="JSON format file that contains extra data useful in printing this worksheet, e.g., 3d plots", type=str, default='')
    parser.add_argument("--style", dest="style", help="Styling of the LaTeX document", type=str, choices=['classic', 'modern'], default="modern")

    args = parser.parse_args()
    args.contents = args.contents == 'true'
    args.remove_tmpdir = args.remove_tmpdir == 'true'
    args.subdir = args.subdir == 'true'

    if args.extra_data_file:
        import json
        extra_data = json.loads(open(args.extra_data_file).read())
    else:
        extra_data = {}

    remove_tmpdir=args.remove_tmpdir

    curdir = os.path.abspath('.')
    for filename in args.filename:
        os.chdir(curdir)  # stuff below can change away from curdir

        if args.subdir:
            from os.path import dirname, basename, splitext, join
            dir           = dirname(filename)
            subdir        = '%s-sagews2pdf' % splitext(basename(filename))[0]
            work_dir      = join(dir, subdir)
            remove_tmpdir = False
        elif args.work_dir is not None:
            work_dir      = os.path.abspath(os.path.expanduser(args.work_dir))
            remove_tmpdir = False
        else:
            work_dir = None

        from subprocess import CalledProcessError
        try:
            sagews_to_pdf(filename,
                          title         = args.title.decode('utf8'),
                          author        = args.author.decode('utf8'),
                          date          = args.date,
                          outfile       = args.outfile,
                          contents      = args.contents,
                          remove_tmpdir = remove_tmpdir,
                          work_dir      = work_dir,
                          style         = args.style
                         )
        # subprocess.check_call might throw
        except CalledProcessError as e:
            sys.stderr.write('CalledProcessError: %s\n' % e)
            exit(1)

if __name__ == "__main__":
    main()