def readme():
    with open('README.md') as f:
        return f.read()

from setuptools import setup

setup(
    name             = 'smc_sagews',
    version          = '1.0',
    description      = 'SageMathCloud Sage Worksheets',
    long_description = readme(),
    url              = 'https://github.com/sagemathinc/smc',
    author           = 'SageMath, Inc.',
    author_email     = 'office@sagemath.com',
    license          = 'GPLv3+',
    packages         = ['smc_sagews'],
    install_requires = ['markdown2', 'ansi2html'],
    zip_safe        = False,
    classifiers     = [
        'License :: OSI Approved :: GPLv3',
        'Programming Language :: Python :: 2.7',
        'Topic :: Mathematics :: Server',
    ],
    keywords        = 'server mathematics cloud',
    test_suite      = 'nose.collector',
    tests_require   = ['nose']
)
