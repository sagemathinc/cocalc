#!/usr/bin/env python3
# Compute Image Integration Tests
# Goal of this testsuite is, to make sure that all relevant software, libraries and packages are installed.
# Each test either checks that it exists, maybe runs it, or even executes a short test, or display the version number.

from textwrap import dedent
import unittest
from subprocess import getoutput as run

# binaries: each of them is:
# 1. name (also as string)
# 2. optional string to search in output
# 3. optional command line params (default: --version)
BINARIES = [
    'git', 'latexmk', 'bash', 'gcc', 'clang',
    ('dot', 'dot - graphviz', '-V'),
    'pdftk',
    ('convert', 'ImageMagick'),
    ('ipython', '4'),
    ('ipython3', '4'),
    ('ssh', 'OpenSSH_6', '-V'),
    ('primesieve', 'primesieve 5'),
    ('plink', 'PLINK!', ''), # actually, p-link with a symlink to it
    ('polymake', 'polymake version 3'),
    ('pdflatex', 'pdfTeX 3.14'),
    ('python2', 'python 2.7'),
    ('python3', 'python 3'),
    ('xelatex', 'xetex'),
    ('axiom', 'AXIOMsys', '-h'),
    ('open-axiom', 'OpenAxiom 1'),
    ('giac', '1.2'),
    ('mpiexec', 'HYDRA'),
    ('ocaml', 'version 4.', '-version')
]

# python 2 libs
PY2 = [
    'numpy', 'scipy', 'matplotlib', 'pandas', 'statsmodels'
]

# python 3 libs
PY3 = [
    'numpy', 'scipy', 'matplotlib', 'pandas', 'statsmodels'
]

class SMCSoftwareTest(unittest.TestCase):

    def test_git(self):
        git = run('git --version')
        print(git)
        self.assertTrue('git' in git)

    def test_latex(self):
        latexmk = run('latexmk --version')
        print(latexmk)
        self.assertTrue('Latexmk' in latexmk)

    def test_binaries(self):
        for bin in BINARIES:
            if isinstance(bin, str):
                cmd = bin
                token = bin.lower()
                args = '--version'
            else:
                cmd = bin[0]
                token = bin[1] if len(bin) >= 2 else bin[0].lower()
                args = bin[2] if len(bin) == 3 else '--version'
            v = run('{cmd} {args}'.format(**locals()))
            self.assertIn(token.lower(), v.lower())

    def test_python(self):
        CMD = dedent('''\
        {exe} -c "from __future__ import print_function
        import {lib}
        print('{exe} {lib}: ', end='')
        try:
            print({lib}.__version__)
        except:
            print({lib}.version())
        "''')
        for exe, libs in zip(['python2', 'python3'], [PY2, PY3]):
            for lib in libs:
                print(run(CMD.format(**locals())))

    @unittest.expectedFailure
    def test_doesnt_exist(self):
        self.assertIn('text', run('doesnt_exist'))

    def test_isupper(self):
        self.assertTrue('FOO'.isupper())
        self.assertFalse('Foo'.isupper())


if __name__ == '__main__':
    unittest.main()
