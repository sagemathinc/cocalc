# -*- coding: utf-8 -*-
# test_sagews.py
# basic tests of sage worksheet using TCP protocol with sage_server
import socket
import conftest
import os
import re

class TestBadContinuation:
    r"""
    String with badly-formed utf8 would hang worksheet process #1866
    """
    def test_bad_utf8(self, exec2):
        code = r"""print('u"\xe1"')"""
        outp = u"�"
        exec2(code, outp)

class TestUnicode:
    r"""
    To pass unicode in a simulated input cell, quote it.
    That will send the same message to sage_server
    as a real input cell without the outer quotes.
    """
    def test_unicode_1(self, exec2):
        r"""
        test for cell with input u"äöüß"
        """
        ustr = 'u"äöüß"'
        x = r'\xe4\xf6\xfc\xdf'
        exec2(ustr, x)
    def test_unicode_2(self, exec2):
        r"""
        Test for cell with input u"ááá".
        Input u"ááá" in an actual cell causes latin1 encoding to appear
        enclosed by u"...", inside a unicode string in the message to sage_server.
        (So there are two u's in the displayed message in the log.)
        Code part of logged input message to sage_server:
          u'code': u'u"\xe1\xe1\xe1"\n'
        Stdout part of logged output message from sage_server:
          "stdout": "u\'\\\\xe1\\\\xe1\\\\xe1\'\\n"
        """
        ustr = 'u"ááá"'
        x = r'\xe1\xe1\xe1'
        exec2(ustr, x)
    def test_unicode_3(self, exec2):
        r"""
        Test for cell with input "ááá".
        Input "ááá" in an actual cell causes utf8 encoding to appear
        inside a unicode string in the message to sage_server.
        Code part of logged input message to sage_server:
          u'code': u'"\xe1\xe1\xe1"\n'
        Stdout part of logged output message from sage_server:
          "stdout": "\'\\\\xc3\\\\xa1\\\\xc3\\\\xa1\\\\xc3\\\\xa1\'\\n"
        """
        ustr = '"ááá"'
        x = r'\xc3\xa1\xc3\xa1\xc3\xa1'
        exec2(ustr, x)
    def test_unicode_4(self, exec2):
        r"""
        test for cell with input "öäß"
        """
        ustr = '"öäß"'
        x = r'\xc3\xb6\xc3\xa4\xc3\x9f'
        exec2(ustr, x)

class TestOutputReplace:
    def test_1865(self,exec2):
        code = 'for x in [u"ááá", "ááá"]: print(x)'
        xout = u'ááá\nááá\n'
        exec2(code, xout)

class TestErr:
    def test_non_ascii(self, test_id, sagews):
        # assign to hbar to trigger non-ascii warning
        code = "ħ = 9"
        m = conftest.message.execute_code(code = code, id = test_id)
        sagews.send_json(m)
        # expect 2 messages from worksheet client
        # 1 stderr Error in lines 1-1
        typ, mesg = sagews.recv()
        assert typ == 'json'
        assert mesg['id'] == test_id
        assert 'stderr' in mesg
        assert 'Error in lines 1-1' in mesg['stderr']
        assert 'should be replaced by < " >' not in mesg['stderr']
        conftest.recv_til_done(sagews, test_id)
    def test_bad_quote(self, test_id, sagews):
        # assign x to U+201C (could use U+201D) to trigger bad quote warning
        code = "“"
        m = conftest.message.execute_code(code = code, id = test_id)
        sagews.send_json(m)
        # expect 2 messages from worksheet client
        # 1 stderr Error in lines 1-1
        typ, mesg = sagews.recv()
        assert typ == 'json'
        assert mesg['id'] == test_id
        assert 'stderr' in mesg
        assert 'non-ascii' in mesg['stderr']
        typ, mesg = sagews.recv()
        assert typ == 'json'
        assert mesg['id'] == test_id
        assert 'stderr' in mesg
        assert 'should be replaced by < " >' in mesg['stderr']
        conftest.recv_til_done(sagews, test_id)
    def test_bad_mult(self, test_id, sagews):
        # warn about possible missing '*' with patterns like 3x^2 and 5(1+x)
        code = ("x=1\ny=3x^2x")
        m = conftest.message.execute_code(code = code, id = test_id)
        sagews.send_json(m)
        # expect 2 messages from worksheet client
        # 1 stderr
        typ, mesg = sagews.recv()
        assert typ == 'json'
        assert mesg['id'] == test_id
        assert 'stderr' in mesg
        assert 'implicit multiplication' in mesg['stderr']
        # 2 done
        conftest.recv_til_done(sagews, test_id)

