# CRITICAL: I don't know any other way to ensure the permissions are
# right on the templates than this
import os
from os.path import join
path = os.path.dirname(os.path.realpath(__file__))
os.system("chmod a+r -R %s"%join(path, "smc_pyutil", "templates"))

def readme():
    with open('README.md') as f:
        return f.read()

from setuptools import setup

# CRITICAL!
# -s tells python to not load the user's "site" packages in ~/.local
# otherwise, setuptool's startup scripts do not work, if there is a conflicting
# setuptools version in .local/lib/python-packages (or, any other locally installed python lib)
# setting sys.executable changes the she-bang #!... at the top of these scripts
# credits to http://stackoverflow.com/a/17329493
import sys
# MANUALLY disable when doing development!, where we do `pip install --user --upgrade smc_pyutil/`
sys.executable = '/usr/bin/python -s'

setup(
    name             = 'smc_pyutil',
    version          = '1.1',
    description      = 'SageMathCloud Python Utilities',
    long_description = readme(),
    url              = 'https://github.com/sagemathinc/smc',
    author           = 'SageMath, Inc.',
    author_email     = 'office@sagemath.com',
    license          = 'GPLv3+',
    packages         = ['smc_pyutil'],
    install_requires = ['markdown2', 'psutil'],
    zip_safe        = False,
    classifiers     = [
        'License :: OSI Approved :: GPLv3',
        'Programming Language :: Python :: 2.7',
        'Topic :: Mathematics :: Server',
    ],
    keywords        = 'server mathematics cloud',
    scripts         = ['smc_pyutil/bin/smc-sage-server'],
    entry_points    = {
        'console_scripts': [
            'open                 = smc_pyutil.smc_open:main',
            'smc-sagews2pdf       = smc_pyutil.sagews2pdf:main',
            'smc-sws2sagews       = smc_pyutil.sws2sagews:main',
            'smc-docx2txt         = smc_pyutil.docx2txt:main',
            'smc-open             = smc_pyutil.smc_open:main',
            'smc-new-file         = smc_pyutil.new_file:main',
            'smc-status           = smc_pyutil.status:main',
            'smc-jupyter          = smc_pyutil.jupyter_notebook:main',
            'smc-ls               = smc_pyutil.git_ls:main',
            'smc-compute          = smc_pyutil.smc_compute:main',
            'smc-start            = smc_pyutil.start_smc:main',
            'smc-stop             = smc_pyutil.stop_smc:main',
            'smc-update-snapshots = smc_pyutil.update_snapshots:update_snapshots',
            'smc-top              = smc_pyutil.smc_top:main',
        ]
    },
    include_package_data = True
)
