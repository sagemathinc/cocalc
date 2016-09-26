# coding: utf8
###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014-2016, SageMath, Inc.
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

# NOTE:
# At one point there was a hack I'm using around line 171 of
#   /usr/local/sage/current/local/lib/python/site-packages/IPython/html/notebookapp.py
# to get it to use my local static/ipython directory, for much better speed.

"""
This script manages the installation of additional components into the SageMath environment.

Usage:

    ./sage -ipython -i build.py
    # which instantiates: bs = BuildSage(), hence then:
    >>> bs.everything()

Design:
* all actions of the `SageBuild` class must be idempotent.
* it runs from the SAGE_ROOT location, and creates and uses a `tmp` directory right inside of it (downloads, extractions, builds)
* a few actions do hardcode paths, like `install_stein_watkins`, but most of them are generic.

Read more:

* build.md: how to setup compute nodes → most entries are formalized in smc-ansible, see compute-setup.yaml
* anaconda.md: instructions about setting up Anaconda3.

TODO:

- [ ] Install FGA gap packages:

      cd local/gap/gap-4.7.8/pkg/fga
      wget http://www.gap-system.org/pub/gap/gap4/tar.gz/packages/FGA-1.3.1.tar.gz
      tar xvf FGA-1.3.1.tar.gz
"""

import logging, os, shutil, subprocess, sys, time, urllib2, time
from os.path import join, expanduser, expandvars, abspath, exists

# avoid git errors when there is no author configured
os.environ["GIT_AUTHOR_NAME"] = "SageMathCloud build.py"
os.environ["GIT_AUTHOR_EMAIL"] = "office@sagemath.com"
os.environ["GIT_COMMITTER_NAME"] = "SageMathCloud build.py"
os.environ["GIT_COMMITTER_EMAIL"] = "office@sagemath.com"

# Enable logging
class SMCLoggingContext(logging.Filter):
    def __init__(self):
        logging.Filter.__init__(self)
        self._start = time.time()
    def filter(self, record):
        record.runtime = time.time() - self._start
        record.where = "%s:%s" % (record.filename[:-3], record.lineno)
        return True

fmt = logging.Formatter(fmt = '%(runtime)7.1f %(where)-10s %(levelname)-9s %(message)s')
sh = logging.StreamHandler()
sh.setFormatter(fmt)
sh.setLevel(logging.DEBUG)
log = logging.getLogger('build')
log.setLevel(logging.DEBUG)
log.addFilter(SMCLoggingContext())
log.addHandler(sh)

OS     = os.uname()[0]
PWD    = os.path.abspath('.')
SRC    = os.path.abspath('src')
TMP    = os.path.abspath('tmp')
os.environ['TMP'] = TMP
BUILD  = os.path.abspath('build')
PREFIX = os.path.abspath('local')
os.environ['PREFIX'] = PREFIX

# http://www.nltk.org/data.html#command-line-installation
NLTK_DATA_DIR = os.environ.get("NLTK_DATA", "/ext/nltk_data")

log.info("SRC = '%s'"%SRC)
for path in [SRC, BUILD, TMP]:
    if not os.path.exists(path):
        os.makedirs(path)

# remove special setup for gcc
if 'MAKE' in os.environ:
    del os.environ['MAKE']

# TODO/hsy: the following is unclear, should probably be removed since it is no longer applicable
if 'SAGE_ROOT' not in os.environ:
    log.info("Building salvus user code (so updating PATHs...)")
    os.environ['PATH'] = os.path.join(PREFIX, 'bin') + ':' + os.environ['PATH']
    os.environ['LD_LIBRARY_PATH'] = os.path.join(PREFIX, 'lib') + ':' + os.environ.get('LD_LIBRARY_PATH','')
else:
    log.info("Building/updating a Sage install")

# number of cpus
import multiprocessing
NCPU = multiprocessing.cpu_count()
log.info("detected %s cpus", NCPU)


def cmd(s, path=None):
    s = 'umask 022 && ' + s
    if path is not None:
        s = 'cd "%s" && '%path + s
    log.info("cmd: %s", s)
    t0 = time.time()
    if os.system(s):
        raise Exception('command failed: "%s" (%s seconds)'%(s, time.time()-t0))
    else:
        log.info("cmd %s took %s seconds", s, time.time()-t0)

def download(url):
    # download target of given url to TMP directory
    import urllib
    t0 = time.time()
    target = os.path.join(TMP, os.path.split(url)[-1].split('?')[0])
    log.info("Downloading %s to %s..."%(url, target))
    urllib.urlretrieve(url, target)
    log.info("Took %s seconds"%(time.time()-t0))
    return target

def extract_package(basename):
    log.info("extracting package %s by finding tar ball in SRC directory, extract it in build directory, and return resulting path",
             basename)
    for filename in os.listdir(TMP):
        if filename.startswith(basename):
            i = filename.rfind('.tar.')
            if i == -1:
                i = filename.rfind('.tgz')
            path = os.path.join(BUILD, filename[:i])
            if os.path.exists(path):
                log.info("removing existing path %s", path)
                shutil.rmtree(path)
            cmd('tar xf "%s"'%os.path.abspath(os.path.join(TMP, filename)), BUILD)
            return path
    raise RuntimeError("unable to extract package %s"%basename)

def deprecated(func):
    def wrapped(*args, **kwargs):
        log.warning("calling deprecated function %s", func.__name__)
    return wrapped

# These pip packages are installed **without** dependencies -- explicit dependencies are listed below.
# Therefore, this makes sure that numpy, ipython and friends stay how they are!
SAGE_PIP_PACKAGES = [
    'mpld3',              # D3 Renderings of Matplotlib Graphics -- https://github.com/jakevdp/mpld3
    'mercurial',          # used when installing neuron
    'backports.ssl-match-hostname',   # a dependency of tornado (we don't install deps automatically right now)
    'tornado',            # used by IPython notebook
    'pandas',
    'pandasql',
    'patsy',
    'statsmodels',
    'numexpr',
    'tables',
    'scikit_learn',
    'gensim',
    'theano',
    'dask',
    'distributed',
    'toolz',
    'cytoolz',
    'geopandas',
    'descartes',
    'scikit-image',
    'Shapely',
    'SimPy',
    'ncpol2sdpa',
    'hdbscan',
    'openpyxl',
    'xlrd',
    'xlwt',
    'pyproj',
    'bitarray',
    'h5py',
    'ipdb', # https://github.com/sagemathinc/smc/issues/319
    'pandas-profiling',
    'netcdf4',
    'lxml',
    'munkres',
    'oct2py',
    'psutil',
    # 'pymc', # pymc v2 doesn't work due to too old numpy api. pymc3 below does work, though.
    'git+https://github.com/pymc-devs/pymc3',
    'requests', # Python HTTP for Humans. (NOTE: plotly depends on requests)
    'plotly',
    'mahotas',
    'rpy2',     # We have to upgrade rpy2, since the one in sage is so old, and it breaks IPython Notebook's R interface.
    'clawpack',
    'psycopg2', # Python-PostgreSQL Database Adapter
    'nose',     # nose extends unittest to make testing easier
    'redis',    # Python client for Redis key-value store
    'pymongo',  # Python driver for MongoDB
    'fabric',   # Fabric is a simple, Pythonic tool for remote execution and deployment.
    'MySQL-python', # Python interface to MySQL
    'paramiko', # SSH2 protocol library
    'httplib2', # A comprehensive HTTP client library.
    'greenlet', # Lightweight in-process concurrent programming
    'gmpy2',
    'mmh3',
    'joblib',
    'colorpy',
    #'rootpy',    # supports ROOT data analysis framework  -- broken "import ROOT" doesn't work anymore
    'tabulate',
    'certifi',    # dependency of https://github.com/obspy, which is installed systemwide from an ubuntu package repo
    'ez_setup',   # needed by fipy
    #'pysparse',    # needed by fipy; for the ==1.2-dev213 bullshit, see http://stackoverflow.com/questions/25459011/how-to-build-pysparse-on-ubuntu; it's amazing how bad pypi and python packaging are.  Wow.
    'fipy',       # requested by Evan Chenelly <echenelly@gmail.com> -- "A finite volume PDE solver in Python".
                  # to get it to build had to instead download directly and comment out these lines from setup.py
                  # #import ez_setup; ez_setup.use_setuptools()
    'python-igraph', # requested by Santhust <santhust31@gmail.com> -- "High performance graph data structures and algorithms" -- https://pypi.python.org/pypi/python-igraph/0.7
    'mygene',   # requested by Luca Beltrame for a bioinformatics course
    'singledispatch',  # needed by rpy2 ipython extension now
    'qutip',    # QuTiP is open-source software for simulating the dynamics of open quantum systems.
    'tinyarray',
    'pysal',    # requested by Serge Rey of ASU for a course on Geographic Information Analysis
    'folium',   # requested by Serge Rey of ASU for a course on Geographic Information Analysis
    'pint',     # units package: http://pint.readthedocs.org/en/0.6/
    'seaborn',
    'ipythonblocks',
    'line_profiler',
    'astropy',
    'mrjob',
    'boto',
    'pattern',
    'brewer2mpl',
    'ggplot',
    'periodictable',
    'nltk',
    'param',
    'holoviews',
    'plink',
    'spherogram',
    'FXrays',
    'snappy',
    'twitter',
    'bayespy==0.3.6',   # last version that supports Python2 -- 0.4.x on is Python3 only!
    'aplpy',
    'PyDSTool',
    'progressbar',  # requested by David Lisbonne
    'pdfminer', # requested by Mesut Karakoc
    'wcsaxes',
    'reproject',
    'pyopenssl',
    'scikits.bootstrap',
    'pystan',
    'biopython',
    'guppy',
    'pybtex',
    'bokeh',
    'numba',
    'pandas-datareader',
    'rethinkdb',
    'pytz',
    'pyparsing',
    'filterpy',
    'control',
    'yattag',
    'pyyaml',
    'charm-crypto',   # depends on installing libpbc to /usr system-wide, which is done in build.md
    'bash_kernel', # the jupyter bash kernel
    'cvxpy', # convex optimization toolbox by univ stanford
    'pydataset', # datasets from R for pandas
    'pygsl',  # I own https://pypi.python.org/pypi/pygsl -- based on https://sourceforge.net/projects/pygsl/?source=typ_redirect
    'wordcloud', # https://github.com/amueller/word_cloud
    'cobra', # https://cobrapy.readthedocs.io/en/stable/
    'python-libsbml', # dependency of cobra
    'markdown',
    'vpython', # http://vpython.org/ used in physics
    'tdigest',
    'numpy-stl',
    'blaze',
    'npTDMS',
    'nipype',  # https://github.com/nipy/nipype/
    'hypothesis',
    'xgboost', # https://github.com/dmlc/xgboost
    ]

# additional environment settings for specific packages
SAGE_PIP_PACKAGES_ENV = {'clawpack':{'LDFLAGS':'-shared'}}

# More pip packages, which are dependencies of the above
SAGE_PIP_PACKAGES_DEPS = [
    'Nikola[extras]',
    'enum34', 'singledispatch', 'funcsigs', 'llvmlite', # used for numba
    'beautifulsoup4',
    'datasift',
    'vpnotebook', # http://vpython.org/ used in physics
    'python_utils',
    'jdcal',
    'fiona',
    'enum',
    'ansi2html', 'configparser', 'entrypoints', # needed for jupyter, and the jupyter<->sagews bridge
    'python_utils',
    'ecos', # cvxpy
    'scs', # cvxpy
    'multiprocess', # cvxpy
    'dill', # cvxpy
    'CVXcanon', # cvxpy
    'fastcache', # cvxpy
    'CommonMark', # pymc3
    'recommonmark', # pymc3
    'nbsphinx', # pymc3
    'numpydoc', # pymc3
    'enum34', # pymc3
    'smart_open', # gensim
    'odo', # blaze
    'multipledispatch', # blaze
    'datashape', # blaze
    'sqlalchemy', # blaze
    'contextlib2', # blaze
    'flask-cors', # blaze
    'bintrees', # tdigest
    'pyudorandom', # tdigest
    'traits', 'simplejson', 'prov', 'nibabel', 'funcsigs',  # https://github.com/nipy/nipype/blob/master/requirements.txt
    'autobahn', 'twisted', 'idna', 'pyasn1', 'ipaddress', 'pycparser', 'cffi', 'cryptography', 'pyopenssl', 'attrs', # datasift
    'pyasn1-modules', 'service-identity', 'futures', 'requests-futures', 'ndg-httpsclient', # datasift
]

# TODO make add an additional category of pip packages, where it is always safe to install with dependencies
# first candidate for this might be datasift

# Additional packages for R -- compare this to smc-ansible/r.yaml and the compute integration tests
R_PACKAGES = [
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
    'brian',
    'rugarch',
    'quantmod',
    'swirl',
    'psych',
    # 'spatstat', # not available for 3.2.4
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
    'agricolae',
    'nortest',
    'gplots',
    'Hmisc',
    'survey',
    'maps',
    'plotly',
]

# Sage has additionally some optional packages. We try to install as many of them as feasible.
SAGE_OPTIONAL_PACKAGES = [
    'buckygen',
    'benzene',
    #'chomp',
    'database_cremona_ellcurve',
    'database_odlyzko_zeta',
    'database_pari',
    'cbc',
    'cluster_seed',
    #'coxeter3',
    'cryptominisat',
    'cunningham_tables',
    'database_gap',
    'database_jones_numfield',
    'database_kohel',
    'database_symbolic_data',
    'dot2tex',
    'fricas',
    'gambit',
    'gap_packages',
    'gnuplotpy',
    'kash3',
    'lie',
    'mcqd',
    'nauty',
    'normaliz',
    'nzmath',
    'ore_algebra',
    #'p_group_cohomology',  # currently broken; still broken
    'phc',
    #'pyx',   # EVIL AND BROKEN
    'qhull',
    'topcom',
    '4ti2',
    'modular_decomposition',
    'csdp',    # experimental; non-GPL compatible, but that is OK as we are not distributing.  commercial use encouraged.
]

###########################################################################
# Functions that install extra packages and bug fixes to turn a standard
# Sage install into the one used in SMC.
###########################################################################
class BuildSage(object):
    def __init__(self):
        try:
            from sage.all import SAGE_ROOT
        except:
            raise RuntimeError("BuildSage must be run from within a Sage install")
        self.SAGE_ROOT = SAGE_ROOT
        self.failed_pip = []
        self.failed_spkg = []

    def path(self, path):
        """
        Turn a path relative to SAGE_ROOT into an absolute path.
        """
        return os.path.join(self.SAGE_ROOT, path)

    def cmd(self, s):
        cmd(s, self.SAGE_ROOT)

    def everything(self):
        """
        Do everything to patch/update/install/enhance this Sage install.
        """
        actions = [
            #"pull_smc_sage", # broken
            #"unextend_sys_path",
            "patch_sage_location",
            "patch_banner",
            "patch_sage_env",
            "user_site",
            "install_sloane",
            "install_projlib",
            "install_pip",
            "install_pip_packages",
            "install_jinja2", # since sage's is too old and pip packages doesn't upgrade
            "install_R_packages",
            "install_R_bioconductor",
            "install_rstan",
            "install_pystan",
            "install_optional_packages",
            "install_quantlib",
            "install_basemap",
            "install_pydelay",
            "install_gdal",
            "install_stein_watkins",
            "install_jsanimation",
            "install_sage_manifolds",
            "install_r_jupyter_kernel",
            "install_jupyter_ipywidget",
            "install_cv2",
            "install_cairo",
            "install_psage",
            "install_pycryptoplus",
            "install_nltk_data",
            "install_tensorflow",
            # "install_neuron", # also fails
        ]

        try:
            for action in actions:
                try:
                    log.info((' %s ' % action).center(80, "="))
                    getattr(self, action)()
                except RuntimeError as re:
                    # this error contains a vital information or problem, operator has to fix it
                    raise re
                except Exception as ex:
                    # otherwise, well, do the next action
                    log.error("Action %s causes problem %s → continuing" % (action, ex))
        finally: # always run cleanup and fix permissions!
            self.clean_up()
            #self.extend_sys_path()
            self.fix_permissions()

        #install_ipython_patch()  # must be done manually still

    def install_sage_manifolds(self):
        # TODO: this will probably fail due to an interactive merge request (?)
        self.cmd("cd $SAGE_ROOT && git pull https://github.com/sagemanifolds/sage.git </dev/null && sage -br < /dev/null")

    def install_r_jupyter_kernel(self):
        # see https://github.com/IRkernel/IRkernel
        self.cmd(r"""echo 'install.packages("devtools", repos="http://ftp.osuosl.org/pub/cran/"); install.packages("RCurl", repos="http://ftp.osuosl.org/pub/cran/"); install.packages("base64enc", repos="http://ftp.osuosl.org/pub/cran/"); install.packages("uuid", repos="http://ftp.osuosl.org/pub/cran/"); library(devtools); install_github("armstrtw/rzmq"); install_github("IRkernel/repr"); install_github("IRkernel/IRdisplay"); install_github("IRkernel/IRkernel");' | R --no-save""")

    def install_jupyter_ipywidget(self):
        '''
        This finishes the setup of ipywidget inside jupyter notebook. no idea why this is necessary, and if this would be necessary
        to run again after something changes ...
        '''
        self.cmd('jupyter nbextension enable --py --sys-prefix widgetsnbextension')

    @deprecated
    def pull_smc_sage(self):
        self.cmd("cd $SAGE_ROOT && git pull https://github.com/sagemathinc/smc-sage")

    def install_jinja2(self):
        self.cmd("pip install -U jinja2")

    @deprecated
    def install_ipython_patch(self):
        """
        TODO:
        """
        raise RuntimeError(r"""TODO: change 'local/lib/python/site-packages/notebook/notebookapp.py' to 'static_url_prefix = '/static/jupyter/''""")

    def install_jsanimation(self):
        # maybe just pip install git+https://github.com/jakevdp/JSAnimation.git ?
        self.cmd("cd $TMP && rm -rf JSAnimation && git clone https://github.com/jakevdp/JSAnimation.git && cd JSAnimation && python setup.py install && rm -rf $TMP/JSAnimation")

    def install_psage(self):
        self.cmd("cd $TMP && rm -rf psage && git clone https://github.com/williamstein/psage.git && cd psage&& sage setup.py install && rm -rf $TMP/psage")

    def install_pycryptoplus(self):
        self.cmd("cd $TMP && rm -rf python-cryptoplus && git clone https://github.com/doegox/python-cryptoplus && cd python-cryptoplus && python setup.py install && rm -rf $TMP/python-cryptoplus")

    def install_cv2(self):
        # The ln at the end below gets rid of a firewire error on startup: http://stackoverflow.com/questions/12689304/ctypes-error-libdc1394-error-failed-to-initialize-libdc1394/26028597#26028597
        self.cmd("cd $SAGE_ROOT && cp -v /usr/local/lib/python2.7/dist-packages/*cv2* local/lib/python2.7/ && sudo ln -f /dev/null /dev/raw1394")

    def install_cairo(self):
        self.cmd("cd $TMP && rm -rf py2cairo && git clone git://git.cairographics.org/git/py2cairo && cd py2cairo && ./autogen.sh && ./configure --prefix=$SAGE_ROOT/local && make install")

    def patch_sage_location(self):
        """
        Since we build Sage in-place and never move it, the sage-location script
        is a total waste of time, which only gets worse the more optional packages
        we install. Thus we disable it completely.
        """
        target = self.path("local/bin/sage-location")
        f = open(target).read()
        before = "'__main__':"
        after  = "'__main__' and False:"
        if before in f:
            log.info("patching %s"%target)
            f = f.replace(before, after)
            open(target,'w').write(f)
        else:
            if after not in f:
                raise RuntimeError("unable to patch %s"%target)
            log.info("already patched %s"%target)

    def patch_banner(self):
        """
        The default Sage banner is too verbose, frightening (since I always run devel versions),
        and misleading -- since notebook() doesn't work on SMC, and help(...) is basically useless.
        """
        path = self.path("local/bin/sage-banner")
        v = open(path).readlines()
        if len(v) < 5:
            log.info("Sage banner already patched.")
        else:
            log.info("Patching the Sage banner.")
            v[3] = '\xe2\x94\x82 Enhanced for SageMathCloud.                                        \xe2\x94\x82\n'
            w = [v[i] for i in [0,1,3,4]]
            open(path,'w').write(''.join(w))

    def patch_sage_env(self):
        """
        Many optional Sage packages are still up as optional packages, but they **DON'T work**
        due to Andrew/Volker/whoever deprecating SAGE_DATA before they updated our optional
        packages accordingly (which sucks).  Anyways, this works around the issue for now, which is
        at least present in sage-6.2.rc0.
        """
        path = self.path("src/bin/sage-env")
        f = open(path).read()
        target = 'export SAGE_DATA="$SAGE_SHARE"'
        if target not in f:
            log.info("patching %s"%path)
            open(path,'a').write('\n'+target)
        else:
            log.info("%s already patched"%path)
        data = self.path("data")
        if not os.path.exists(data):
            # absolute paths are fine, since we will NEVER be moving this sage install
            os.symlink(self.path("local/share"), data)
        os.environ['SAGE_DATA'] = os.environ['SAGE_SHARE']

    def user_site(self):
        import site
        if not site.ENABLE_USER_SITE:
            raise RuntimeError("Make sure to patch out this -- http://trac.sagemath.org/ticket/14243 -- by removing the stuff involving PYTHONNOUSERSITE from src/bin/sage-env")

    def install_sloane(self):
        """
        Install the Sloane Encyclopaedia tables.  These used to be installed via an optional package,
        but instead one must now run a command from within Sage.
        """
        from sage.all import SloaneEncyclopedia
        SloaneEncyclopedia.install(overwrite=True)

    def install_projlib(self):
        """
        Install the proj cartographic transformations and geodetic computations library
        into Sage, which is a dep for the pyproj pip package.
        """
        version_base = "4.9.2"  # TODO need to automate finding newest!
        version = version_base + ""  # find newest version at http://download.osgeo.org/proj/?C=M;O=D
        download("http://download.osgeo.org/proj/proj-%s.tar.gz"%version)
        path = extract_package("proj-%s"%version)
        # their tarball if annoying, with path not what is before .tar.gz. UGH.
        i = path.find(version_base)
        path = path[:i+len(version_base)]
        cmd("./configure --prefix=%s"%self.SAGE_ROOT, path)
        cmd("make -j%s install"%NCPU, path)

    def install_pip(self):
        """Install pip itself into Sage; it should come with Sage, but doesn't yet."""
        self.unextend_sys_path()
        cmd("pip install --upgrade pip")

    def extend_sys_path(self):
        """
        Make this Sage install able to import modules installed in the system-wide
        Python, e.g., make it so there is some hope that maybe
        'import dolfin' works, even though dolfin is some
        complicated FEM library installed system-wide via Ubuntu packages
        This MUST be done *after* pip is installed.
        """
        raise RuntimeError("this is a VERY bad idea -- see https://groups.google.com/forum/#!topic/sage-release/MGkb_-y-moM")
        target = self.path("local/lib/python/sitecustomize.py")
        ROOT = '/usr/lib/x86_64-linux-gnu/' + [x for x in os.listdir('/usr/lib/x86_64-linux-gnu/') if 'root' in x][-1]
        paths = ['/usr/lib/python2.7/dist-packages/', '/usr/local/lib/python2.7/dist-packages/', '/usr/lib/pymodules/python2.7', ROOT]
        # sanity check
        for p in paths:
            if not os.path.exists(p):
                raise RuntimeError("path %s does not exist"%p)
        f = open(target).read() if os.path.exists(target) else ""
        to_add = "import sys; sys.path.extend(%r)"%paths
        if to_add not in f:
            log.info("patching %s by appending '%s'"%(target, to_add))
            open(target, 'a').write('\n' + to_add)
        else:
            log.info("%s already patched"%target)

        raise "I'm manually modifying sitecustomize.py to include ~/.local/python.... -- see previous install; don't understand why this is needed."

    def unextend_sys_path(self):
        #raise RuntimeError("this is a VERY bad idea -- see https://groups.google.com/forum/#!topic/sage-release/MGkb_-y-moM")
        for f in ["local/lib/python/sitecustomize.py", "local/lib/python/sitecustomize.pyc"]:
            target = self.path(f)
            log.info(target)
            if os.path.exists(target):
                log.info("removing %s"%target)
                os.unlink(target)

    def install_pip_packages(self, upgrade=True):
        """Install each pip-installable package."""
        self.failed_pip = []
        self.unextend_sys_path()

        os.environ['PROJ_DIR']=os.environ['NETCDF4_DIR']=os.environ['HDF5_DIR']='/usr/'
        os.environ['C_INCLUDE_PATH']='/usr/lib/openmpi/include'

        os.environ['HDF5_DIR']='/usr/lib/x86_64-linux-gnu/hdf5/serial/'  # needed for tables -- right path at least for ubuntu 15.04, and 16.04
        # for these, see https://github.com/Unidata/netcdf4-python/issues/341
        os.environ['USE_NCCONFIG']='0'
        os.environ['HDF5_LIBDIR']='/usr/lib/x86_64-linux-gnu/hdf5/serial'
        os.environ['HDF5_INCDIR']='/usr/include/hdf5/serial'
        os.environ['NETCDF4_DIR']='/usr'

        for packages in [SAGE_PIP_PACKAGES, SAGE_PIP_PACKAGES_DEPS]:
            for package in packages:
                log.info((" Installing/upgrading %s **"%package).center(80, "*"))
                # NOTE: the "--no-deps" is critical below; otherwise, pip will do things like install a version of numpy that is
                # much newer than the one in Sage, and incompatible (due to not having patches), which if it installs at all, will
                # break Sage (i.e. lots of doctests fail, etc.).
                e = ' '.join(["%s=%s"%x for x in SAGE_PIP_PACKAGES_ENV[package].items()]) if package in SAGE_PIP_PACKAGES_ENV else ''
                try:
                    self.cmd("%s pip install %s --no-deps --ignore-installed %s"%(e, '--upgrade' if upgrade else '', package))
                except:
                    log.error("problem installing %s", package)
                    self.failed_pip.append(package)

    def install_R_packages(self):
        s = ','.join(['"%s"'%name for name in R_PACKAGES])
        c = 'install.packages(c(%s), repos="https://cloud.r-project.org/", clean = TRUE, dependencies = TRUE)'%s
        self.cmd("echo '%s' | R --no-save"%c)

    def install_R_bioconductor(self):
        c = 'source("http://bioconductor.org/biocLite.R"); biocLite()'
        self.cmd("echo '%s' | R --no-save"%c)
        c = 'library(BiocInstaller); biocLite(c("geneplotter", "limma", "puma", "affy", "edgeR", "BitSeq", "hgu95av2cdf", "hgu133plus2cdf", "affyPLM", "ddCt", "hgu95av2.db", "affydata", "hgu133plus2.db", "oligo", "limma", "gcrma", "affy", "GEOquery", "pd.mogene.2.1.st", "pd.mouse430.2", "Heatplus", "biomaRt"))'
        self.cmd("echo '%s' | R --no-save"%c)

    def install_rstan(self):
        """
        Install the Rstan package into R.
        """
        c = 'install.packages(c("rstan"), repos="https://cloud.r-project.org/", clean = TRUE, dependencies = TRUE)'
        self.cmd("echo '%s' | R --no-save"%c)

    def install_pystan(self):
        # follow directions here: https://github.com/stan-dev/pystan
        self.cmd(r"""cd $TMP && rm -rf pystan && git clone --recursive https://github.com/stan-dev/pystan.git && cd pystan && python setup.py install && rm -rf $TMP/pystan""")

    def install_optional_packages(self, skip=[], first=None):
        self.failed_spkg = []
        from sage.all import install_package
        if 'MAKE' not in os.environ:
            # some packages, e.g., chomp, won't build without MAKE being set.
            os.environ['MAKE'] = "make -j%s"%NCPU
        for package in SAGE_OPTIONAL_PACKAGES:
            if package in skip:
                log.info("** Skipping %s **"%package)
                continue
            if first and package != first:
                continue
            first = False
            log.info("** Installing/upgrading %s **"%package)
            #install_package(package)
            # We have to do this (instead of use install_package) because Sage's install_package
            # command is completely broken in rc0 at least (April 27, 2014).
            try:
                self.cmd("sage -p %s <<< yes"%package)
            except:
                log.error("problem installing sage package %s", package)
                self.failed_spkg.append(package)
        # We also have to do a "sage -b", since some optional packages don't get fully installed
        # until rebuilding Cython modules.  I posted to sage-devel about this bug on Aug 4.
        self.cmd("sage -b")

    def install_quantlib(self):
        cmd("cd $TMP && rm -rf QuantLib-SWIG && git clone https://github.com/lballabio/QuantLib-SWIG && cd QuantLib-SWIG && ./autogen.sh && make -j%s -C Python install && cd $SAGE_ROOT/local/lib/ && ln -s /usr/local/lib/*QuantLib* ."%NCPU)

    def install_neuron(self):
        """
        Neuron -- for empirically-based simulations of neurons and networks of neurons

        (requested by Jose Guzman)
        """
        def clean_up():
            if exists(expandvars('$TMP/iv')): shutil.rmtree(expandvars("$TMP/iv"))
            if exists(expandvars('$TMP/nrn')): shutil.rmtree(expandvars("$TMP/nrn"))
        from sage.all import SAGE_LOCAL
        clean_up()
        try:
            cmd("hg clone http://www.neuron.yale.edu/hg/neuron/iv", "$TMP")
            cmd("hg clone http://www.neuron.yale.edu/hg/neuron/nrn", "$TMP")
            cmd("./build.sh && ./configure --prefix=%s && make -j%s && make install"%(SAGE_LOCAL, NCPU), "$TMP/iv")
            cmd("./build.sh && ./configure --prefix=%s --with-iv=%s --with-nrnpython && make -j%s && make install && cd src/nrnpython/ && python setup.py install"%(SAGE_LOCAL, SAGE_LOCAL, NCPU), "$TMP/nrn")
        finally:
            clean_up()

    def install_basemap(self):
        """
        basemap -- Plot data on map projections with matplotlib
        """
        try:
            import mpl_toolkits.basemap
            installed_version = mpl_toolkits.basemap.__version__
            version = [x for x in urllib2.urlopen("https://raw.githubusercontent.com/matplotlib/basemap/master/setup.py").readlines()
                        if x.startswith('__version__')][0].split('=')[1].strip(' \'"\n')
            log.info("version=%s, installed_version=%s", version, installed_version)
            if version == installed_version:
                log.info("basemap version %s already installed", version)
                return
        except Exception, msg:
            pass
        cmd("/usr/bin/git clone https://github.com/matplotlib/basemap.git", "$TMP")
        cmd("python setup.py install", "$TMP/basemap")
        shutil.rmtree(expandvars("$TMP/basemap"))

    def install_pydelay(self):
        """
        Install pydelay -- a program which translates a system of delay differential equations (DDEs) into simulation C-code and compiles and runs the code (using scipy weave).  -- see http://pydelay.sourceforge.net/

        Requested for UCLA by Jane Shevtsov: https://plus.google.com/115360165819500279592/posts/73vK9Pw4W6g
        """
        cmd("umask 022 && cd $TMP && rm -rf pydelay* &&  wget http://downloads.sourceforge.net/project/pydelay/pydelay-0.1.1.tar.gz &&  tar xf pydelay-0.1.1.tar.gz &&  cd pydelay-0.1.1 &&  python setup.py install &&  rm -rf $TMP/pydelay*")

    def install_gdal(self):
        """
        Install GDAL -- for geospatial imaging.
        """
        # The make; make -j8 below instead of just make is because the first make mysteriously gives an error on
        # exit, but running it again seems to work fine.
        GDAL_VERSION       = '2.1.1'    # options here -- http://download.osgeo.org/gdal/CURRENT/
        cmd("umask 022 &&  unset MAKE && cd $TMP && export V=%s && rm -rf gdal-$V* && wget http://download.osgeo.org/gdal/CURRENT/gdal-$V.tar.xz && tar xf gdal-$V.tar.xz && cd gdal-$V && export CXXFLAGS=-I/usr/include/mpi/ && ./configure --with-python --prefix=$SAGE_ROOT/local && unset SHELL && make -j8; make && cd swig/python && python setup.py install && cd ../.. && make install && cd $TMP && rm -rf gdal-$V*"%GDAL_VERSION)

    def install_stein_watkins(self):
        # The package itself is "sage -i database_stein_watkins"
        cmd("umask 022 && cd $SAGE_ROOT/local/share/ && ln -sf /ext/sage/stein_watkins .")

    @deprecated
    def install_4ti2(self):
        """
        DEPRECATED: 4ti2 is an optional package now, so this is not needed any more
        """
        site = "http://www.4ti2.de/"
        target = [x for x in urllib2.urlopen("%s/download_4ti2.html"%site).readlines() if 'source code</a>' in x][0].split('"')[1]
        version = target.split("_")[1].split('/')[0]
        z = [x for x in sorted(os.listdir(self.path("local/var/lib/sage/installed"))) if x.startswith('4ti2')]
        if len(z) == 0:
            installed_version = ''
        else:
            installed_version = z[-1].split('-')[1]
        if version == installed_version:
            log.info("4ti2 version %s already installed", version)
            return
        download(site + target)
        pkg = target.split('/')[-1]
        path = extract_package(pkg)
        cmd("./configure --prefix=/usr/local/sage/current/local/ && time make -j%s"%NCPU, path)
        cmd("make install", path)
        open(self.path("local/var/lib/sage/installed/4ti2-%s"%version),'w')
        shutil.rmtree(path)

    def install_nltk_data(self):
        """
        NLTK comes with a data library. See: http://www.nltk.org/data.html#command-line-installation

        This task's prerequesite is that nltk is installed (otherwise it will simply fail)
        """
        cmd("mkdir -p {}".format(NLTK_DATA_DIR))
        cmd("python -m nltk.downloader -d {} all".format(NLTK_DATA_DIR))

    def install_tensorflow(self):
        """
        Check for updated wheel packages here:
        https://www.tensorflow.org/versions/r0.9/get_started/os_setup.html#pip-installation

        Status:
          * Doesn't work in sage, e.g. despite that it needs the protobuf version 3,
            It also fails to work due to a name clash between "SnapPy" and https://pypi.python.org/pypi/python-snappy :-(
          * (update 2016-09-26) it works, but no explicit installation of protobuf version 3, just the wheel package.
            This seems to include all the dependencies and works fine now.
        """
        TF_BINARY_URL='https://storage.googleapis.com/tensorflow/linux/cpu/tensorflow-0.10.0-cp27-none-linux_x86_64.whl'
        cmd("pip install --upgrade %s" % TF_BINARY_URL)

    def clean_up(self):
        log.info("starting cleanup ...")
        # clean up packages downloaded and extracted using the download command
        shutil.rmtree(TMP)

        # call sage's clean command
        self.cmd("make clean")

        # clean up packages left over from optional Sage package installs
        # This should be a make target, but isn't (in sage-6.2, at least).
        for p in ['upstream', 'local/var/tmp/sage/build']:
            path = self.path(p)
            if os.path.exists(path):
                log.info("deleting %s"%path)
                shutil.rmtree(path)

        if len(self.failed_pip) > 0:
            log.info("failed pip packages")
            for pip in self.failed_pip:
                log.info("  * %s", pip)

        if len(self.failed_spkg) > 0:
            log.info("failed sage packages")
            for spkg in self.failed_spkg:
                log.info("  * %s", spkg)
        log.info("... done")

    def fix_permissions(self):
        log.info("fixing permissions ...")
        self.cmd("chmod a+r -R .; find . -perm /u+x -execdir chmod a+x {} \;")
        log.info("... done")


bs = BuildSage()

# this is for non-interactive usage
if __name__ == '__main__':
    import sys
    if len(sys.argv) == 1:
        print("\n\nUsage: ./sage {} everything       [to build and install everything]".format(__file__))
    elif len(sys.argv) == 2:
        if sys.argv[1] == 'everything':
            bs.everything()
