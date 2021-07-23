# -*- coding: utf-8 -*-

# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – read LICENSE.md for details

###
# To do development on this, install it locally:
#   pip install --user --upgrade smc_pyutil/
###

# CRITICAL: I don't know any other way to ensure the permissions are
# right on the templates than this
from __future__ import absolute_import
import os
from os.path import join
path = os.path.dirname(os.path.realpath(__file__))
os.system("chmod a+r -R %s" % join(path, "smc_pyutil", "templates"))


def readme():
    with open('README.md') as f:
        return f.read()


# from https://github.com/ninjaaron/fast-entry_points/ issue https://github.com/sagemathinc/cocalc/issues/2259
import fastentrypoints
from setuptools import setup, find_packages

# This checks, if setup.py is run with 'install --user'
# in that case we assume it is installed for development and do NOT change the python executable.
# Therefore we want to load the local library via the site.py mechanism.
# (this mimics http://svn.python.org/projects/python/trunk/Lib/distutils/dist.py, called in setup behind the scenes)
from distutils.core import Distribution
d = Distribution()
d.parse_command_line()

# CRITICAL!
# Uses a wrapped python executable to not load the user's "site" packages in ~/.local.
# Otherwise, setuptool's startup scripts do not work, if there is a conflicting
# setuptools version in .local/lib/python-packages (or, any other locally installed python lib)
# setting sys.executable changes the she-bang #!... at the top of these scripts
# credits to http://stackoverflow.com/a/17329493
# NOTE: the logic below does not work right now, because the nosite variant is not available
#       during the build process. however, maybe there is a way to use the included
#       cocalc-python3-clean script at some point in the future ...
python3_nosite = '/usr/local/bin/python3-nosite'
# don't overwrite for local smc-in-smc development
if 'user' not in list(d.command_options.get("install", {}).keys()):
    # check, if python3_nosite exists and is executable
    if os.path.isfile(python3_nosite) and os.access(python3_nosite, os.X_OK):
        import sys
        sys.executable = python3_nosite

# names for console scripts
# history: "smc" was based on the old name "SageMathCloud".
# Then, we switched to "cc" as a shortcut for CoCalc, but it's similar to the C compiler.
# Using "cocalc-*" is easier to discover and remember.

cs = [
    'open                 = smc_pyutil.smc_open:main',
    'close                = smc_pyutil.smc_close:main',
    # only the newest prefix
    'cocalc-top          = smc_pyutil.cocalc_top:main',
]

for prefix in ['smc', 'cc', 'cocalc']:
    add = cs.append
    add('%s-sagews2pdf = smc_pyutil.sagews2pdf:main' % prefix)
    add('%s-sws2sagews = smc_pyutil.sws2sagews:main' % prefix)
    add('%s-open       = smc_pyutil.smc_open:main' % prefix)
    add('%s-new-file   = smc_pyutil.new_file:main' % prefix)
    add('%s-status     = smc_pyutil.status:main' % prefix)
    add('%s-jupyter    = smc_pyutil.jupyter_notebook:main' % prefix)
    add('%s-jupyter-no-output= smc_pyutil.jupyter_delete_output:main' % prefix)
    add('%s-ipynb2sagews = smc_pyutil.ipynb2sagews:main' % prefix)
    add('%s-start        = smc_pyutil.start_smc:main' % prefix)
    add('%s-stop         = smc_pyutil.stop_smc:main' % prefix)
    add('%s-html2sagews  = smc_pyutil.html2sagews:main' % prefix)
    add('%s-sagews2ipynb = smc_pyutil.sagews2ipynb:main' % prefix)

    # only cc and cocalc prefixes
    if prefix != 'smc':
        add('%s-ipynb-to-pdf = smc_pyutil.ipynb_to_pdf:main' % prefix)
        add('%s-close        = smc_pyutil.smc_close:main' % prefix)
        add('%s-jupyterlab   = smc_pyutil.jupyter_lab:main' % prefix)
        add('%s-jupyter-classic-open = smc_pyutil.jupyter_notebook:prepare_file_for_open'
            % prefix)

setup(
    name='smc_pyutil',
    version='1.1',
    description='CoCalc Python Utilities',
    long_description=readme(),
    url='https://github.com/sagemathinc/cocalc',
    author='SageMath, Inc.',
    author_email='office@sagemath.com',
    license='GPLv3+',
    packages=find_packages(),
    install_requires=['markdown2', 'psutil', 'PyYAML', 'ansi2html'],
    zip_safe=False,
    classifiers=[
        'License :: OSI Approved :: GPLv3',
        'Programming Language :: Python :: 2.7',
        'Programming Language :: Python :: 3.5',
        'Topic :: Mathematics :: Server',
    ],
    keywords='server mathematics cloud',
    scripts=[
        'smc_pyutil/bin/smc-sage-server', 'smc_pyutil/bin/cocalc-python3-clean'
    ],
    entry_points={'console_scripts': cs},
    include_package_data=True,
)
