#!/usr/bin/env python
# -*- coding: utf8 -*-

###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015 -- The SageMathCloud Authors
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################


# Testing of misc.py
# Run me directly, or indirectly via $ nosetests ...

import os
import unittest
import misc


def f1(a, b, k=1):
    return k * a + b


class MiscTests(unittest.TestCase):

    def test_local_ip_addresse(self):
        res = misc.local_ip_address()
        self.assertTrue(res.startswith("192.") or res.startswith("10."))

    def test_is_temp_directory(self):
        import tempfile
        self.assertTrue(misc.is_temp_directory(tempfile.mktemp()))
        self.assertFalse(misc.is_temp_directory(tempfile.mktemp() + '../..'))

    def test_sha1(self):
        s = "SageMathCloud"
        res = misc.sha1(s)
        exp = os.popen("echo -n %s | sha1sum" % s).read().split()[0]
        self.assertEquals(res, exp)

    def test_is_running(self):
        p = os.getpid()
        self.assertTrue(misc.is_running(p))
        for i in range(1, 64000):
            if not misc.is_running(i):
                break
        else:
            # very unlikely
            self.fail("is_running never returned 'False'")


class MiscTestThreadMap(unittest.TestCase):

    def setUp(self):
        self.thread_map_args = [([x, 1], {'k': 2}) for x in range(10)]
        self.thread_map_res = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
        self.thread_map_wrong = [(["x", 1], {}) for x in range(10)]

    def test_thread_map_old(self):
        r = misc.thread_map(f1, self.thread_map_args, impl="old")
        self.assertEqual(r, self.thread_map_res)

    def test_thread_map_threadpool(self):
        r = misc.thread_map(f1, self.thread_map_args, impl="threadpool")
        self.assertEqual(r, self.thread_map_res)

    def test_thread_map_throws_old(self):
        with self.assertRaises(RuntimeError) as cm:
            misc.thread_map(f1, self.thread_map_wrong, impl="old")
        self.assertTrue(
            "cannot concatenate 'str' and 'int' objects" in str(
                cm.exception))

    def test_thread_map_throws_threadpool(self):
        with self.assertRaises(RuntimeError) as cm:
            misc.thread_map(f1, self.thread_map_wrong, impl="threadpool")
        self.assertTrue(
            "cannot concatenate 'str' and 'int' objects"
                in str(cm.exception))

if __name__ == "__main__":
    import misc_test
    testsuite = unittest.TestLoader().loadTestsFromModule(misc_test)
    unittest.TextTestRunner(verbosity=1).run(testsuite)
