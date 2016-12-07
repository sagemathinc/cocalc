#!/usr/bin/env python3

import os, sys

if len(sys.argv) != 3:
    print("USAGE: ./update-commit.py style3 385f36457d4107ca5a2d2201bea31304060dcbc5")
    sys.exit(1)

# basically do this:
#   ./control.py build -t style3 -r -c 385f36457d4107ca5a2d2201bea31304060dcbc5 && c run -t style3-385f36

tag    = sys.argv[1]
commit = sys.argv[2]

cmd = "./control.py build --rebuild_all  -t %s -c %s && ./control.py run -t %s-%s"%(
    tag, commit, tag, commit[:6])

print(cmd)
os.system(cmd)
