# Installing Anaconda

Written down on 2015-12-28, hopefully helpful for the next time.

1. https://www.continuum.io/downloads
1. linux, python 3.5, 64-bit

on computeX

1. download into ~/tmp/
1. then:
```
    sudo su
    umask 002
    bash Anaconda{installation filename}.sh
    # install directory must not exist beforehand, I'll put it into `/projects/anaconda3` ... IT'S NOT POSSIBLE TO MOVE THE DIR LATER ON (rpath FTW?)
    cd /projects
    chown -R salvus:salvus anaconda3
    exit # ... such that you are salvus again
    cd anaconda3
```


OK, that looks good, numba, ipython, jupyter, etc. are installed.

## activate the environment

1. inside /projects/anaconda3: `. bin/activate root`
where root just stands for the base environment of anaconda (not the root user)

1. to exit the environment: `. deactivate`

## Regularly update Anaconda:

1. activate the environment (see above)
1. `umask 002`
1. Update the conda package manager itself: `conda update conda`
1. Now update everything: `conda update --all`
## Anaconda Channels

**.condarc**

at 2016-07-12 for setting up the env in the external volume for the smc-project containers, it was:

    > cat .condarc
    channels:
      - ioos
      - omnia
      - Unidata
      - jjhelmus
      - juanlu001
      - obspy
      - r
      - mro
      - bioconda
      - conda-forge
      - defaults
    show_channel_urls: True

## installing additional packages

* http://docs.continuum.io/anaconda/pkg-docs
* additional ones via pip3 or so (once you are inside the anaconda environment, they'll be installed inside of it, too!)

1. activate the environment (see above)
1. `umask 002`

       conda install -y basemap bcolz blist boost bsdiff4 btrees bz2file  cherrypy chest cloudpickle coverage cssselect csvkit cubes cvxopt cymem dask distributed xarray datrie db dill django docopt toolz cytoolz

       conda install -y ecdsa ephem execnet  feedparser flake8 flask-wtf flask-login future gensim geos gunicorn heapdict html5lib  lancet libnetcdf line_profiler llvm locket lockfile logilab-common mako markdown2 mdp mock markdown descartes pysal

       conda install -y mpi4py mpich2 mpmath msgpack-python natsort ncurses netcdf4 numpydoc paramiko partd pylint pymc pyramid_jinja2 pyramid_mako pystan queuelib runipy scikit-bio seaborn sh stripe mpmath

       conda install -y thinc translationstring twisted unidecode venusian virtualenv webtest whoosh yt pandas-datareader pandas pandasql geopandas mahotas blaze cvxopt bqplot tabulate pycrypto rpy2 r-recommended biopython gensim

not possible to install (conflict with python 3.5):

    pyamg, opencv, mercurial, ... ?

## CLEANUP!

    conda clean --all --yes

## **(!!!)** uninstall boto

(clashes with system wide boto in /usr/share) -- this was pre-containerization, so that's maybe not useful any more

    conda uninstall -y boto

## kernel.json file

To make Anaconda3 available in the jupyter notebook, it does need to know about it in such a kernel.json file. (next to it should be some icon graphics files, too)

**important** the paths in `env` need to be pointing to the correct python installation paths:


    /projects/sage/jupyter/kernels/anaconda3 >> cat kernel.json
    {
     "display_name": "Anaconda 3",
     "argv": [
      "/projects/anaconda3/bin/python3",
      "-E",
      "-m",
      "ipykernel",
      "-f",
      "{connection_file}"
     ],
     "language": "python",
     "env":{
        "LD_LIBRARY_PATH" : "/projects/anaconda3/lib",
        "PYTHONPATH" : "/projects/anaconda3/lib/python3.5:/projects/anaconda3/lib/python3.5/site-packages",
        "PYTHONHOME" : "/projects/anaconda3/lib/python3.5"
     }
    }

## PIP3 Packages

This is a list of additional packages, which aren't already part of anaconda 3, but they are mentioned in build.py for being installed into the sagemath environment. Of course, they need to work with python3 and hence install them via `pip install ...` inside the anaconda environment (`which pip` should give anacondas')

```
pip3 = [
    'scikits.bootstrap',
    'mahotas',
]
```



### older install notes:

To learn about them, do `anaconda search -t conda PACKAGENAMEPATTERN` and then `anaconda show …` as told in the output string.

    conda install -y --channel https://conda.anaconda.org/andreas-h shapely
    conda install -y --channel https://conda.anaconda.org/omnia munkres
    conda install -y --channel https://conda.anaconda.org/IOOS oct2py


