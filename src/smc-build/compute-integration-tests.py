#!/usr/bin/env python3
# Compute Image Integration Tests
# Goal of this testsuite is, to make sure that all relevant software, libraries and packages are installed.
# Each test either checks that it exists, maybe runs it, or even executes a short test, or display the version number.
# A failure is an actual problem, which either means that the library is broken or the test has to be adjusted.
# Additionally, via the conftest.py file, a test report is generated in the $HOME directory.
# It lists all software and libraries with their version numbers.

# A failure is an actual problem, which either means that the library is broken or the test has to be adjusted.
# Additionally, via the conftest.py file, a test report is generated in the $HOME directory.
# It lists all software and libraries with their version numbers.

import os
import sys
import shutil
import pytest
import itertools as it
from textwrap import dedent
from subprocess import getstatusoutput, CalledProcessError

def run(cmd, expected_status = 0):
    status, output = getstatusoutput(cmd)
    if status == expected_status:
        return output
    else:
        raise CalledProcessError(cmd = cmd, returncode = status)

# binaries: each entry in this list is either a string or a tuple. entries:
# 1. name
# 2. optional string to search in output
# 3. optional command line params (default: --version)
# 4. optional status code, because sometimes --version gives retcode of 1
# Hint: to get a list of executables, run $ bash -c 'compgen -c | sort | less'
BINARIES = [
    'git', 'latexmk', 'bash', 'gcc', 'pdftk', 'julia', 'autopep8', 'aspell',
    'automake', 'autoconf', 'biber', 'bibtex', 'cmake', 'ccache', 'coffee',
    'xz', 'mono', 'cpp', 'cython', 'diff3', 'dvips',
    'ruby', 'erb', 'flex', 'm4', 'fish',
    'htop', 'h5dump', 'inkscape', 'libreoffice',
    'lilypond', 'lzma', 'make', 'markdown',
    ('feynmf', None, None, 255),
    ('docbook2pdf', 'docbook-utils'),
    ('latex', 'pdfTeX'),
    ('haskell-compiler', 'glasgow haskell'),
    ('gfortran', 'fortran'),
    ('f77', 'fortran'),
    ('f95', 'fortran'),
    ('hg', 'mercurial'),
    ('yacc', 'bison'),
    ('lua', None, '-v'),
    ('lneato', None, '-V', 1),
    ('lrzip', None, '-V'),
    ('jags', 'JAGS', '/dev/null'),
    ('h5math', 'h5totxt', '-V'),
    ('go', 'go', 'version'),
    ('f2py', '2', '-v'),
    ('dotty', 'dotty', '-V', 1),
    ('clojure', '1.6', "-e '(clojure-version)'"),
    ('7z', '7-Zip', '-h'),
    ('asy', 'Asymptote', '-version'),
    ('avconv', 'ffmpeg', None, 1),
    ('cheetah', 'CHEETAH', '', 1),
    ('hg', 'Mercurial'),
    ('cvs', 'Concurrent Versions System'),
    ('gp', 'GP/PARI CALCULATOR'),
    ('java', 'OpenJDK Runtime', '-version'),
    ('dot', 'dot - graphviz', '-V'),
    ('convert', 'ImageMagick', '-version'),
    ('ipython', '5'),
    ('ipython3', '5'),
    ('ssh', 'OpenSSH_7', '-V'),
    ('primesieve', 'primesieve 5', '--version', 1),
    ('plink', 'PLINK!', '', 1), # actually, p-link with a symlink to it
    ('polymake', 'polymake version 3'),
    ('pdflatex', 'pdfTeX 3.14'),
    ('python2', 'python 2.7'),
    ('python3', 'python 3'),
    ('/ext/anaconda/bin/python', 'python 3'),
    ('xelatex', 'xetex'),
    ('axiom', 'AXIOMsys', '-h'),
    ('open-axiom', 'OpenAxiom 1'),
    ('giac', '1.2'),
    ('mpiexec', 'HYDRA'), # TODO there are several mpi versions, check that this one is the "good" one
    ('R', 'R version 3'),
    ('ocaml', 'version 4.', '-version'),
    ('clang', 'clang version 3'),
]

PY_COMMON = [
    'yaml', 'mpld3', 'numpy', 'scipy', 'matplotlib', 'pandas', 'patsy', 'markdown', 'plotly',
    'numexpr', 'tables', 'h5py', 'theano', 'dask', 'psutil', 'rpy2', 'xlrd', 'xlwt',
    'toolz', 'cytoolz', 'geopandas', 'openpyxl', 'sympy', 'Bio', 'wordcloud', 'lxml', 'descartes',
]


# python 2 libs
PY2 = PY_COMMON + [
    'statsmodels', 'patsy', 'blaze', 'bokeh', 'cvxpy',
    'clawpack', # py2 only, and it dosesn't have a version info
    'numba', 'xarray', 'ncpol2sdpa',
]

# python 3 libs
PY3 =  PY_COMMON + [
    # 'statsmodels', # broken right now (2016-07-14), some scipy error
    'patsy', 'blaze', 'bokeh', 'cvxpy', 'numba', 'xarray', 'datasift', 'theano', 'seaborn',
    'cvxpy', 'cytoolz', 'toolz', 'mygene', 'statsmodels', 'cobra', 'gensim',
]

PY_SAGE = PY_COMMON + [
    'sage' # there is no sage.__version__ ???
    # 'numba', # would be cool to have numba in sagemath
    'mahotas', 'patsy', 'statsmodels', 'cvxpy',
    'clawpack', # no canonical version info
    'mercurial', 'projlib', 'netcdf4', 'bitarray', 'munkres', 'plotly', 'oct2py', 'shapely', 'simpy', 'gmpy2',
    'tabulate', 'fipy', 'periodictable', 'ggplot', 'nltk', 'snappy', 'guppy', 'skimage',
    'jinja2', 'ncpol2sdpa', 'pymc', 'pymc3', 'pysal', 'cobra', 'gensim',
]

PY3_ANACONDA = PY_COMMON + [
    # 'cvxopt', # no version
    'tensorflow', 'mahotas', 'patsy', 'statsmodels', 'blaze', 'bokeh', 'cvxpy', 'numba', 'dask', 'nltk',
    'ggplot', 'snappy', 'skimage', 'numba', 'xarray', 'symengine', 'pymc', 'gensim', 'jinja2',
]

# these don't have a version info, so just check if they can be imported
# they still need to be listed in the applicable areas to test above!
PY_NOVERS = [
    'wordcloud', 'lxml', 'descartes', 'clawpack', 'sage',
]

# This is the system wirde offical R from the CRAN ubuntu repos and Sage's R
R_exes = ['/usr/bin/R', 'sage -R']

R_libs = [
    'rstan', # works, but still uses a lot of memory for compiling
    'ggplot2',
    'stringr',
    'plyr',
    'reshape2',
    'zoo',
    'car',
    'mvtnorm',
    'e1071',
    'Rcpp',
    'lattice',
    'KernSmooth',
    'Matrix',
    'cluster',
    'codetools',
    'mgcv',
    'rpart',
    'survival',
    'fields',
    'circular',
    'glmnet',
    'Cairo',
    'XML',
    'data.table',
    # 'brian', # doesn't exist for Sage's older R, i.e. 3.2.4
    'rugarch',
    'quantmod',
    'swirl',
    'psych',
    'spatstat',
    'UsingR',
    'readr',
    'MCMCpack',
    'ROCR',
    'forecast',
    'numDeriv',
    'NORMT3',
    'ggmap',
    'np',
    'crs',
    'SemiParBIVProbit',
    'combinat',
    'maptree',
    # 'agricolae', # no longer exists for modern R 3.3.1
    'nortest',
    'gplots',
    'Hmisc',
    'survey',
    'maps'
]

# see smc-ansible/julia.yaml
JULIA = [
    'IJulia', # in jupyter notebook
    'Interact', # https://github.com/JuliaLang/Interact.jl (for IJulia)
    'SymPy',
    'PyPlot', # https://github.com/stevengj/PyPlot.jl
    'Bokeh',  # https://github.com/JuliaLang/IJulia.jl
    'Gadfly', # https://github.com/dcjones/Gadfly.jl
    'Mocha',  # https://github.com/pluskid/Mocha.jl
    'DataFrames', # https://github.com/JuliaStats/DataFrames.jl
    'Winston',    # 2D plotting
    'Convex', # https://github.com/JuliaOpt/Convex.jl (optimization)
    'Optim', # https://github.com/JuliaOpt/Optim.jl
    'JuMP', # https://github.com/JuliaOpt/JuMP.jl
    'Clp', # solver
    'Ipopt', # https://github.com/JuliaOpt/Ipopt.jl
    'ECOS', # https://github.com/JuliaOpt/ECOS.jl
    'GLPK', # https://github.com/JuliaOpt/GLPKMathProgInterface.jl
    'ParallelAccelerator', # https://github.com/IntelLabs/ParallelAccelerator.jl
    'MXNet', # https://github.com/dmlc/MXNet.jl
    'Graphs', # https://github.com/JuliaLang/Graphs.jl
    'Bio', # https://github.com/BioJulia/Bio.jl (bioinformatics)
    'SCS', # Solving optimization problems
    'RDatasets',
]


# http://pytest.org/latest/parametrize.html#parametrized-test-functions
@pytest.mark.parametrize("bin", BINARIES)
def test_binaries(bin, bindata):
    if isinstance(bin, str):
        cmd = bin
        token = bin.lower()
        args = '--version'
        status = 0
    else:
        cmd = bin[0]
        token = bin[1] if (len(bin) >= 2 and bin[1] is not None) else bin[0].lower()
        args = bin[2] if (len(bin) >= 3 and bin[2] is not None) else '--version'
        status = bin[3] if len(bin) >= 4 else 0
    out = run('{cmd} {args}'.format(**locals()), status)
    assert token.lower() in out.lower()
    # when successful, add info to bindata fixture with full path
    bindata.append([shutil.which(cmd), out])

# testing python libs: test iterates over pairings of executable path and list of packages
PY_EXES = ['python2', 'python3', 'sage -python', '/ext/anaconda/bin/python']
PY_LIBS = [PY2, PY3, PY_SAGE, PY3_ANACONDA]
PY_PAIRS = (zip(it.repeat(exe), set(lib)) for exe, lib in zip(PY_EXES, PY_LIBS))
PY_TESTS = list(it.chain.from_iterable(PY_PAIRS))

@pytest.mark.parametrize("exe,lib", PY_TESTS)
def test_python(exe, lib, libdata):
    CMD = dedent('''\
    {exe} -c "from __future__ import print_function
    from types import ModuleType
    import {lib}
    print({lib})''')
    novers = lib in PY_NOVERS
    if not novers:
        CMD += dedent('''
        for v in ['__version__', '__VERSION__']:
            if hasattr({lib}, v):
                vers = getattr({lib}, v)
                if type(vers) == ModuleType:
                        print(vers.version)
                else:
                        print(vers)
                break
        else:
            print({lib}.version())
            ''')
    CMD += '"'
    out = run(CMD.format(**locals()))
    assert lib.lower() in out.lower()
    vers_info = 'ok' if novers else out.splitlines()[-1]
    libdata.append(('Python', exe, lib, vers_info))

@pytest.mark.parametrize('exe,lib', it.product(R_exes, set(R_libs)))
def test_r(exe, lib, libdata):
    CMD = '''echo 'require("{lib}"); packageVersion("{lib}")' | {exe} --vanilla --silent'''
    out = run(CMD.format(**locals()))
    assert lib.lower() in out.lower()
    version = out.split('\n')[-2]
    if version.startswith('[1]'):
        libdata.append(('R', exe, lib, version[5:-1]))
    else:
        print("no version info: %s" % version)

# julia package manager functions: http://docs.julialang.org/en/release-0.4/stdlib/pkg/
@pytest.mark.parametrize("lib", JULIA)
def test_julia(lib):
    CMD = '''echo 'using {lib}; Pkg.installed("{lib}")' | julia'''
    out = run(CMD.format(**locals()))
    assert lib.lower() in out.lower()

def test_julia_installed(libdata):
    """
    Listing, which julia packages are installed. This needs to be run as salvus,
    since it updates the git repo (?) of the metadata in the site/v0.X directory.
    Therefore, all files in the the global julia directory need to be owned by salvus.
    """
    jcmd = 'for (k, v) in Pkg.installed(); println(k, ":::", v); end'
    jenv = 'JULIA_PKGDIR=/usr/local/share/julia/site/ julia'
    vers_data = run('''echo '{jcmd}' | {jenv}'''.format(**locals()))
    vers_info = [line.split(':::') for line in vers_data.splitlines()]
    for lib, vers in sorted(vers_info):
        libdata.append(('Julia', 'julia', lib, vers))

# check, that openmpi via the hydra executor is working
# http://mpitutorial.com/tutorials/mpi-hello-world/
# 1. mpicc mpi.c -o mpi
# 2. mpiexec -n 4 ./mpi → 4 lines for each subprocess
MPI_C = r'''\
#include <mpi.h>
#include <stdio.h>
int main(int argc, char** argv) {
    MPI_Init(NULL, NULL);
    int world_size;
    MPI_Comm_size(MPI_COMM_WORLD, &world_size);
    int world_rank;
    MPI_Comm_rank(MPI_COMM_WORLD, &world_rank);
    char processor_name[MPI_MAX_PROCESSOR_NAME];
    int name_len;
    MPI_Get_processor_name(processor_name, &name_len);
    printf("Hello world from processor %s, rank %d"
           " out of %d processors\n",
           processor_name, world_rank, world_size);
    MPI_Finalize();
}
'''

def test_mpi(tmpdir):
    """
    The assumption for this test is, that a working mpi implementation is installed
    and accessible through mpicc and mpiexec. They should most likely be mpich version 3
    and the hydra executor -- http://www.mpich.org/downloads/
    (at least, that's what has always been working in ubuntu and on GCE)
    """
    tmpdir.chdir()
    mpi_c = tmpdir.join('mpi.c')
    mpi_c.write(MPI_C)
    os.system("mpicc mpi.c -o mpi")
    v = run("mpiexec -n 4 ./mpi")
    assert len(v.splitlines()) == 4
    assert "rank 3 out of 4 processors" in v
    print(v)

# OpenMP test
# gcc -o openmp -fopenmp openmp.c
OPENMP_C = r'''\
#include <stdio.h>
#include <stdlib.h>
#include <omp.h>
#include <time.h>
int main()
{
  int n, N = 10000000;
  double* v = (double*)malloc(N*sizeof(double));
  double* w = (double*)malloc(N*sizeof(double));
  double* out = (double*)malloc(N*sizeof(double));
  clock_t start = clock();
  #pragma omp parallel num_threads(4)
  {
    #pragma omp for
    for(int n=0; n<N; ++n)
    {
      out[n] = v[n] + w[n];
    }
  }
  printf("\n num_seconds: %f\n", (double)(clock()-start) / (double)CLOCKS_PER_SEC);
  free(v);
  free(w);
  free(out);
}

'''
def test_openmp(tmpdir):
    """
    This runs a C program with OpenMP pragma statements.
    """
    tmpdir.chdir()
    openmp_c = tmpdir.join('openmp.c')
    openmp_c.write(OPENMP_C)
    os.system("gcc -o openmp -fopenmp openmp.c")
    v = run("./openmp")
    assert float(v.split()[-1]) < 1.
    print(v)

# test, that certain env variables are set
# see smc-ansible/files/terminal-setup.sh and similar
# TODO check that referenced paths really exist, etc.

ENV_VARS = [
    "ANACONDA3", "JULIA_PKGDIR", "SAGE_ATLAS_LIB"
]

@pytest.mark.parametrize("name", ENV_VARS)
def test_env(name):
    assert name in os.environ

# sanity self-check
def test_doesnt_exist():
    '''
    This should throw, i.e. it does a string-in-string test which is true,
    but the return value isn't 0.
    '''
    with pytest.raises(CalledProcessError):
        'doesnt_exist' in run('doesnt_exist')

if __name__ == '__main__':
    #pytest.main()
    print('run $ py.test %s' % __file__)
