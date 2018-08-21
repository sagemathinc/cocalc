#!/usr/bin/env python

import os


def cmd(s):
    print s
    if os.system(s):
        raise RuntimeError("error running '%s'" % s)


if __name__ == '__main__':
    os.chdir("%s/tmp" % os.environ['HOME'])
    cmd("rm -rf cloud-public cloud-private")
    cmd("git clone git@github.com:sagemathinc/smc-public.git cloud-public && rm -rf cloud-public/*"
        )
    cmd("git clone ~/salvus cloud-private")
    cmd("rsync -axvH cloud-private/salvus/ cloud-public/")
    cmd("cp -v cloud-private/*.md cloud-public/")
    cmd("cd cloud-public && git add --all .")
    print "See %s/tmp/cloud-public" % os.environ['HOME']
    print "NOW do this:"
    print "git commit -a -v"
    print "git push"
    print "git push git@github.com:sagemath/cloud.git"
    #cmd("rm -rf cloud-private")
