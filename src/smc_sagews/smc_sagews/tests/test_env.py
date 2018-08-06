# -*- coding: utf-8 -*-
# test_env.py
# tests of sage worksheet environment options
import conftest
import os
import sys

class TestSetEnv:
    def test_set_startup(self, exec2, test_ro_data_dir):
        """
        verify that SAGE_STARTUP_FILE is set by pytest to a-init.sage
        """
        pssf = os.path.join(test_ro_data_dir, conftest.my_sage_startup())
        exec2("print(os.environ['SAGE_STARTUP_FILE'])",pssf)

    def test_init_sage(self, exec2):
        exec2("sys.path[-1]", "xyzzy")