import pytest
from os.path import expanduser
import pandas as pd
pd.set_option('display.max_colwidth', -1) # also for to_html !
from pprint import pprint
from collections import defaultdict
from datetime import datetime

# columns: programming language, executable, library name, version
LIB_VERSIONS = []

# columns: program name, output of --version or similar (possibly multiline)
BIN_VERSIONS = []

# pytest fixtures are injected into the tests based on the given argument
@pytest.fixture(scope="module")
def libdata():
    return LIB_VERSIONS

@pytest.fixture(scope="module")
def bindata():
    return BIN_VERSIONS

# Basename for the output file, needs to be in a writeable & predictable location inside the container
OUT_FN = expanduser('~/smc-compute-env')

# generating the report
def pytest_terminal_summary(terminalreporter):
    if len(LIB_VERSIONS) > 0:
        libs = pd.DataFrame(LIB_VERSIONS, columns=['Language', 'Executable', 'Library', 'Version'])

    if len(BIN_VERSIONS) > 0:
        bins = pd.DataFrame(BIN_VERSIONS, columns=['Path', 'Information'])
        bins.sort_values('Path', inplace=True)

    with open(OUT_FN + '.html', 'w') as sce:
        sce.write('<!DOCTYPE html>\n')
        sce.write('''<html><head><meta charset="utf-8">
        <style>
        body {font-family: monospace; font-size: 0.85rem; width: 900px; margin: auto;}
        table {border-collapse: collapse;}
        table td {border: 1px solid #999;}
        </style></head><body>''')
        sce.write('<h1>SMC Compute Environment</h1>\n')
        sce.write('''
        <div>Created {}</div>
        '''.format(datetime.utcnow()))

        if 'libs' in locals():
            libs.to_csv(open(OUT_FN + '.libs.csv', 'w'))
            sce.write('<h2>Library Versions</h2>\n')
            for language in libs.Language.unique():
                sce.write('<h3>%s</h3>' % language)
                lang = libs[libs.Language == language]
                lang = lang.pivot(index='Library', columns='Executable', values='Version').fillna('')
                sce.write(lang.to_html())

        if 'bins' in locals():
            bins.to_csv(open(OUT_FN + '.bins.csv', 'w'))
            sce.write('<h2>Executables</h2>\n')
            sce.write('<table class="bins"><thead><th>Path</th><th>Information</th></thead><tbody>')
            for idx, (name, info) in bins.iterrows():
                info = info[:350]
                info = info.splitlines()[:8]
                info_html = '<br/>'.join(info)
                sce.write('<tr><td><b>{name}</b></td><td>{info_html}</td></tr>'.format(**locals()))
            sce.write('</tbody></table>')

