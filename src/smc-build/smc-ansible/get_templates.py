#!/usr/bin/env python3
import os
import sys
import time
import tempfile
from os.path import join, realpath, dirname

SRC = dirname(realpath(__file__))
path = join(SRC, "files", "templates")


def cmd(s):
    t0 = time.time()
    os.chdir(SRC)
    # s = "umask 022; " + s
    print(s)
    if os.system(s):
        sys.exit(1)
    print("TOTAL TIME: %.1f seconds" % (time.time() - t0))

if os.path.exists(path):
    cmd("rm -rf %s" % path)

# cloud examples from github
tmpdir = tempfile.mkdtemp()
try:
    tmpzip = join(tmpdir, 'master.zip')
    # --location tells curl to follow redirects
    cmd("curl --silent --location -o %s https://github.com/sagemath/cloud-examples/archive/master.zip" %
        tmpzip)
    cmd("unzip -q %s -d %s" % (tmpzip, path))
    cmd("chown -R salvus:salvus %s" % path)
    cloud_examples = join(path, "cloud-examples")
    cmd("mv %s %s" % (join(path, "cloud-examples-master"), cloud_examples))
    cmd("cd %s; make" % cloud_examples)
finally:
    cmd("rm -rf %s" % tmpdir)
