import pytest
import pandas as pd
from pprint import pprint
from collections import defaultdict

# columns: programming language, executable, library name, version
LIB_VERSIONS = []

@pytest.fixture(scope="module")
def libdata():
    return LIB_VERSIONS

def pytest_terminal_summary(terminalreporter):
    libs = pd.DataFrame(LIB_VERSIONS, columns=['Language', 'Executable', 'Library', 'Version'])
    libs.set_index(['Language', 'Executable', 'Library'], inplace=True)
    libs.sortlevel(inplace=True)
    pprint(LIB_VERSIONS)
    with open('libdata.html', 'w') as libdata_out:
        libdata_out.write('<!DOCTYPE html>\n<h1>Library Versions</h1>\n')
        for line in libs.to_html().splitlines():
            libdata_out.write('    ' + line + '\n')
    #terminalreporter.write("\nLIBRARY VERSIONS\n")
    #for name, impl in LIB_VERSIONS.items():
    #    terminalreporter.write("{name}:\n".format(**locals()))
    #    for exe, libvers in impl.items():
    #        terminalreporter.write(" +-{exe}:\n".format(**locals()))
    #        for lib, vers in sorted(libvers.items()):
    #            terminalreporter.write("    +-{lib:<30s}: {vers}\n".format(**locals()))