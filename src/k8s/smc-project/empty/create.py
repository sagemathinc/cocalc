#!/usr/bin/env python3
import os
from os.path import exists, abspath, dirname
os.chdir(dirname(abspath(__file__)))

assert os.path.exists("/mnt/compute-disk-xxx"), "This script assumes, that '/mnt/compute-disk' contains the full '/' content of the compute image -- create it via 'docker create ... docker cp ...:/ /mnt/compute-disk"
# later, this /mnt/compute-disk will be mounted read-only on each node
# the "run.sh" contains the mount commands

os.system("sudo rm -rf fakeroot")
os.system("mkdir fakeroot")
os.chdir("fakeroot")

dirs = sorted(["root", "lib", "bin", "sbin", "home", "var", "lib32", "lib64", "usr", "libx32"])
# "etc" can't be symlinked, because docker immediately replaces it with it's own minimal etc dir

for d in dirs:
    os.system("ln -s /linux/{0} {0}".format(d))

# symlinking "/etc" like above doesn't work, docker replaces it with some setup files
os.system("sudo cp -a /mnt/compute-disk/etc .")

print("fakeroot created, now building docker image")

os.chdir("..")
os.system("sudo docker build --no-cache=true --rm --tag=empty:latest .")

