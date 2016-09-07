# test_sagews.py
# basic tests of sage worksheet using TCP protocol with sage_server
import socket
import conftest
import os
import re

from textwrap import dedent

def test_connection_type(sagews):
    print("type %s"%type(sagews))
    assert isinstance(sagews, conftest.ConnectionJSON)
    return

def test_set_file_env(exec2):
    code = "os.chdir(salvus.data[\'path\']);__file__=salvus.data[\'file\']"
    output = None
    exec2(code, output)

def test_assignment(exec2):
    code = "x = 42\nx\n"
    output = "42\n"
    exec2(code, output)

def test_issue70(exec2):
    code = dedent(r"""
    for i in range(1):
        pass
    'x'
    """)
    output = dedent(r"""
    'x'
    """).lstrip()
    exec2(code, output)

def test_issue819(exec2):
    code = dedent(r"""
    def never_called(a):
        print 'should not execute 1', a
        # comment
    # comment at indent 0
        print 'should not execute 2', a
    22
    """)
    output = "22\n"
    exec2(code, output)
