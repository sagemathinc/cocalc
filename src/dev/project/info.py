#!/usr/bin/env python

import os, sys, time

path = os.path.split(os.path.realpath(__file__))[0]; os.chdir(path); sys.path.insert(0, path)

import util

while True:
    try:
        print "Visit       https://cloud.sagemath.com" + util.base_url() + '/\n'
    except Exception, mesg:
        print mesg
        print "waiting..."
    time.sleep(15)

