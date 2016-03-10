#!/usr/bin/env python

import os, sys

path = os.path.split(os.path.realpath(__file__))[0]; os.chdir(path); sys.path.insert(0, path)

import util

util.chdir()
util.cmd("cd ../../; npm run webpack-watch-map")