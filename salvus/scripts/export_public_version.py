#!/usr/bin/env python

import os

def cmd(s):
    print s
    if os.system(s):
        raise RuntimeError("error running '%s'"%s)

if __name__ == '__main__':
    os.chdir("%s/tmp"%os.environ['HOME'])
    cmd("rm -rf cloud-public cloud-private")
    cmd("git clone git@github.com:sagemath/cloud.git cloud-public && rm -rf cloud-public/*")
    cmd("git clone ~/devel/william cloud-private")
    cmd("rsync -axvH cloud-private/salvus/ cloud-public/")
    cmd("cd cloud-public && rm -r conf/deploy*  conf/tinc_* && git add --all .")
    print "See %s/tmp/cloud-public"%os.environ['HOME']
    #cmd("rm -rf cloud-private")
