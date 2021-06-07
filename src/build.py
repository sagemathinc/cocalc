#!/usr/bin/env python

import os

PACKAGES = ['smc-util', 'smc-hub', 'smc-webapp', 'webapp-lib']
for x in os.listdir('packages'):
    path = os.path.join("packages", x)
    if os.path.isdir(path):
        PACKAGES.append(path)


def cmd(s):
    print(s)
    if os.system(s):
        raise RuntimeError("Error executing '%s'" % s)

print("Packages: ", ', '.join(PACKAGES))
for path in PACKAGES:
    print("\n" + "-" * 70 + "\n")
    print("Building %s..." % path)
    print("\n" + "-" * 70 + "\n")
    cmd("cd '%s' && time npm run build" % path)
