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
    'xz', 'mono', 'cpp', 'cython', 'diff3', 'dvips', 'sha1sum', 'perl', 'php',
    'ruby', 'erb', 'flex', 'm4', 'fish', 'nosetests', 'gst', 'ElmerSolver',
    'htop', 'h5dump', 'inkscape', 'libreoffice', 'scheme', 'symphony',
    'lilypond', 'lzma', 'make', 'markdown', 'maxima', 'nim',
    ('obspy3-plot', 'obspy-plot'),
    ('clp', 'Coin LP', '-help'),
    ('cbc', 'CBC MILP Solver', '-help'),
    ('csdb', 'CSDP', ''),
    ('spark', 'Examiner', '-version'),
    'nano', 'pypy', 'rsync', 'sed', 'scons', 'sass', 'zsh',
    'sbcl', 't1asm', 'xpra',
    ('echo ":quit" | scala', 'Scala', ''),
    ('Rscript', 'r scripting front-end'),
    ('npm', '.'),
    ('mc', 'gnu midnight commander'),
    ('nodejs', 'v'),
    ('py.test', 'pytest'),
    ('4ti2-zsolve', '4ti2'),
    ('tmux', None, '-V'),
    ('sml', None, '@SMLversion'),
    ('synctex', None, 'help'),
    ('scilab-cli', 'scilab', '-version', 1),
    ('singular', None, '--version /dev/null'),
    ('echo "quit;" | gap', 'gap', ''),
    ('feynmf', None, None, 255),
    ('docbook2pdf', 'docbook-utils'),
    ('latex', 'pdfTeX'),
    ('haskell-compiler', 'glasgow haskell'),
    ('gfortran', 'fortran'),
    ('f77', 'fortran'),
    ('f95', 'fortran'),
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
    ('$ANACONDA3/bin/python', 'python 3'),
    ('xelatex', 'xetex'),
    ('axiom', 'AXIOMsys', '-h'),
    ('open-axiom', 'OpenAxiom 1'),
    ('giac', '1.2'),
    ('mpiexec', 'HYDRA'), # TODO there are several mpi versions, check that this one is the "good" one
    ('R', 'R version 3'),
    ('ocaml', 'version 4.', '-version'),
    ('clang', 'clang version 3'),
]

# python libs that are installed everywhere
PY_COMMON = [
    'yaml', 'mpld3', 'numpy', 'scipy', 'matplotlib', 'pandas', 'patsy', 'markdown', 'seaborn',
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
    'patsy', 'blaze', 'bokeh', 'cvxpy', 'numba', 'xarray', 'datasift', 'theano',
    'cvxpy', 'cytoolz', 'toolz', 'mygene', 'statsmodels', 'cobra', 'gensim',
]

# python libs in sagemath
PY_SAGE = PY_COMMON + [
    'sage', # there is no sage.__version__ ???
    # 'numba', # would be cool to have numba in sagemath
    'mahotas', 'patsy', 'statsmodels', 'cvxpy',
    'clawpack', # no canonical version info
    'mercurial', 'netCDF4', 'bitarray', 'munkres', 'plotly', 'oct2py', 'shapely', 'simpy', 'gmpy2',
    'tabulate', 'fipy', 'periodictable', 'ggplot', 'nltk', 'snappy', 'guppy', 'skimage',
    'jinja2', 'ncpol2sdpa', 'pymc', 'pymc3', 'pysal', 'cobra', 'gensim',
]

# and in anaconda
PY3_ANACONDA = PY_COMMON + [
    # 'cvxopt', # no version
    'tensorflow', 'mahotas', 'patsy', 'statsmodels', 'blaze', 'bokeh', 'cvxpy', 'numba', 'dask', 'nltk',
    'ggplot', 'skimage', 'numba', 'xarray', 'symengine', 'pymc', 'gensim', 'jinja2',
]

# Tests for R setups and libraries

# the very basic packages
R_libs_common = [
    'IRkernel', 'IRdisplay', 'base', 'boot', 'car', 'curl', 'data.table',
    'ggplot2', 'httr', 'plyr', 'tools', 'survival', 'zoo', 'yaml',
]

# some extras in sage's R and the systemwide R from CRAN
R_libs_extra = [
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
    # 'spatstat', # doesn't exist for Sage's older 3.2.4
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

# This is the system wirde offical R from the CRAN ubuntu repos, Sage's R and Anaconda
R_setups = {
    '/usr/bin/R': R_libs_common + R_libs_extra,
    'sage -R': R_libs_common + R_libs_extra,
    '$ANACONDA3/bin/R': R_libs_common
}

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
    cmd = os.path.expandvars(cmd)
    out = run('{cmd} {args}'.format(**locals()), status)
    assert token.lower() in out.lower()
    # when successful, add info to bindata fixture with full path
    # cmd might be 'echo foo | cmd bar -', hence this
    if '|' in cmd:
        cmd = cmd.rsplit('|', 1)[-1].strip().split()[0]
    bindata.append([shutil.which(cmd), out])

# testing python libs: test iterates over pairings of executable path and list of packages
PY_EXES = ['python2', 'python3', 'sage -python', '$ANACONDA3/bin/python']
PY_LIBS = [PY2, PY3, PY_SAGE, PY3_ANACONDA]
PY_PAIRS = (zip(it.repeat(exe), set(lib)) for exe, lib in zip(PY_EXES, PY_LIBS))
PY_TESTS = list(it.chain.from_iterable(PY_PAIRS))

@pytest.mark.parametrize("exe,lib", PY_TESTS)
def test_python(exe, lib, libdata):
    exe = os.path.expandvars(exe)
    CMD = dedent('''\
    {exe} -c "from __future__ import print_function
    from types import ModuleType
    import {lib}
    print({lib})"''')
    out = run(CMD.format(**locals()))
    assert lib.lower() in out.lower()

@pytest.mark.parametrize("exe", PY_EXES)
def test_python_versions(exe, libdata):
    exe = os.path.expandvars(exe)
    CMD = dedent('''
    {exe} -c "from __future__ import print_function
    import pkg_resources
    mod_names = set(dist.project_name for dist in __import__('pkg_resources').working_set)
    for name in sorted(mod_names):
        try:
            v = pkg_resources.get_distribution(name).version
        except:
            v = "ok"
        print(name + ':::' + v)
    "''')
    vers_data = run(CMD.format(**locals()))
    vers_data = [line for line in vers_data.splitlines() if ':::' in line]
    vers_info = [line.split(':::') for line in vers_data]
    for lib, version in sorted(vers_info):
        libdata.append(('Python', exe, lib, version))

R_PAIRS = (zip(it.repeat(exe), set(lib)) for exe, lib in R_setups.items())
R_TESTS = list(it.chain.from_iterable(R_PAIRS))

@pytest.mark.parametrize('exe,lib', R_TESTS)
def test_r(exe, lib):
    exe = os.path.expandvars(exe)
    CMD = '''echo 'require("{lib}"); packageVersion("{lib}")' | {exe} --vanilla --silent'''
    out = run(CMD.format(**locals()))
    assert lib.lower() in out.lower()

@pytest.mark.parametrize('exe', R_setups.keys())
def test_r_installed(exe, libdata):
    exe = os.path.expandvars(exe)
    CMD = dedent('''
    vers <- installed.packages()[,c("Package", "Version")]
    apply(vers, 1, function(x) { cat(x["Package"], ":::", x["Version"], "\n", sep="") })
    ''')
    vers_data = run('''echo '{CMD}' | {exe} --vanilla --silent'''.format(**locals()))
    # filter input and useless other output
    vers_data = [line for line in vers_data.splitlines() if ':::' in line][1:]
    vers_info = [line.split(':::') for line in vers_data]
    # sometimes, the same lib appears several times
    names = set()
    for lib, version in sorted(vers_info):
        if lib in names:
            continue
        else:
            names.add(lib)
            libdata.append(('R', exe, lib, version))

# julia package manager functions: http://docs.julialang.org/en/release-0.4/stdlib/pkg/
@pytest.mark.parametrize("lib", JULIA)
def test_julia(lib):
    CMD = '''echo 'using {lib}; Pkg.status("{lib}")' | julia'''
    out = run(CMD.format(**locals()))
    assert lib.lower() in out.lower()

def test_julia_installed(libdata):
    """
    Listing, which julia packages are installed. This needs to be run as salvus,
    since it updates the git repo (?) of the metadata in the site/v0.X directory.
    Therefore, all files in the the global julia directory need to be owned by salvus.
    """
    jcmd = 'for (k, v) in Pkg.installed(); println(k, ":::", v); end'
    vers_data = run('''echo '{jcmd}' | julia'''.format(**locals()))
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
