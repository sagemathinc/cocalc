#!/usr/bin/env python
# -*- coding: utf8 -*-
# Testing of misc.py
# Run me via $ nosetests misc_test.py or similar

import os
import unittest
import misc


def f1(a, b, k=1):
    return k * a + b


class MiscTests(unittest.TestCase):

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
    testsuite = unittest.TestLoader().loadTestsFromTestCase(MiscTests)
    unittest.TextTestRunner(verbosity=1).run(testsuite)
