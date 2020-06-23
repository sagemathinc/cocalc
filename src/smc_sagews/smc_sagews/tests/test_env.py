# -*- coding: utf-8 -*-
# test_env.py
# tests of sage worksheet environment options
from __future__ import absolute_import
import conftest
import os
import errno


def remove_no_exc(fname):
    try:
        os.remove(fname)
    except OSError as e:
        if e.errno != errno.ENOENT:
            raise


# NOTE: Tests in this file will not work when run individually.
# Because they require processing different versions of SAGE_STARTUP_FILE,
# each test sets up the next one before it ends.
class TestSetEnv:
    def test_set_startup(self, exec2, test_ro_data_dir):
        """
        verify that SAGE_STARTUP_FILE is set by pytest to a-init.sage
        """
        pssf = os.path.join(test_ro_data_dir, conftest.my_sage_startup())
        exec2("print(os.environ['SAGE_STARTUP_FILE'])", pssf)
        remove_no_exc(pssf)


class TestNoStartupFile:
    def test_init_sage(self, exec2, test_ro_data_dir):
        exec2("pi", pattern="pi")
        pssf = os.path.join(test_ro_data_dir, conftest.my_sage_startup())
        pssf2 = os.path.join(test_ro_data_dir,
                             "sage_init_files/define_var.sage")
        os.symlink(pssf2, pssf)


class TestGoodStartupFile:
    def test_ident_set_file_env(self, exec2):
        """emulate initial code block sent from UI, needed for first show_identifiers"""
        code = "os.chdir(salvus.data[\'path\']);__file__=salvus.data[\'file\']"
        exec2(code)

    def test_init_sage(self, exec2, test_ro_data_dir):
        """check for variable defined in startup file"""
        exec2("show_identifiers()", "xyzzy")
        pssf = os.path.join(test_ro_data_dir, conftest.my_sage_startup())
        remove_no_exc(pssf)
        pssf3 = os.path.join(test_ro_data_dir,
                             "sage_init_files/runtime_err.sage")
        os.symlink(pssf3, pssf)


class TestRuntimeErrStartupFile:
    def test_ident_set_file_env(self, exec2):
        code = "os.chdir(salvus.data[\'path\']);__file__=salvus.data[\'file\']"
        exec2(code)

    def test_init_sage(self, exec2, test_ro_data_dir):
        exec2("None", errout="division by zero")
        pssf = os.path.join(test_ro_data_dir, conftest.my_sage_startup())
        remove_no_exc(pssf)
        pssf4 = os.path.join(test_ro_data_dir,
                             "sage_init_files/syntax_err.sage")
        os.symlink(pssf4, pssf)


class TestSyntaxErrStartupFile:
    def test_ident_set_file_env(self, exec2):
        code = "os.chdir(salvus.data[\'path\']);__file__=salvus.data[\'file\']"
        exec2(code)

    def test_init_sage(self, exec2, test_ro_data_dir):
        exec2("None", errout="invalid syntax")
        pssf = os.path.join(test_ro_data_dir, conftest.my_sage_startup())
        remove_no_exc(pssf)
