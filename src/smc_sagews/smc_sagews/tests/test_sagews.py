# test_sagews.py
# basic tests of sage worksheet using TCP protocol with sage_server
import socket
import conftest
import os
import re

from textwrap import dedent

class TestBasic:
    def test_connection_type(self, sagews):
        print("type %s"%type(sagews))
        assert isinstance(sagews, conftest.ConnectionJSON)
        return

    def test_set_file_env(self, exec2):
        code = "os.chdir(salvus.data[\'path\']);__file__=salvus.data[\'file\']"
        exec2(code)

    def test_assignment(self, exec2):
        code = "x = 42\nx\n"
        output = "42\n"
        exec2(code, output)

    def test_issue70(self, exec2):
        code = dedent(r"""
        for i in range(1):
            pass
        'x'
        """)
        output = dedent(r"""
        'x'
        """).lstrip()
        exec2(code, output)

    def test_issue819(self, exec2):
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

    def test_search_doc(self, exec2):
        code = "search_doc('laurent')"
        html = "https://www.google.com/search\?q=site%3Adoc.sagemath.org\+laurent\&oq=site%3Adoc.sagemath.org"
        exec2(code, html_pattern = html)

    def test_show_doc(self, test_id, sagews):
        # issue 476
        code = "show?"
        patn = "import smc_sagews.graphics; smc_sagews.graphics.graph_to_d3_jsonable?"
        m = conftest.message.execute_code(code = code, id = test_id)
        sagews.send_json(m)
        typ, mesg = sagews.recv()
        assert typ == 'json'
        assert mesg['id'] == test_id
        assert 'code' in mesg
        assert 'source' in mesg['code']
        assert re.sub('\s+','',patn) in re.sub('\s+','',mesg['code']['source'])
        conftest.recv_til_done(sagews, test_id)

class TestSearchSrc:
    def test_search_src_simple(self, execinteract):
        execinteract('search_src("convolution")')

    def test_search_src_max_chars(self, execinteract):
        execinteract('search_src("full cremonadatabase", max_chars = 1000)')
