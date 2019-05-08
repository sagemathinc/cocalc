import os, json

join = os.path.join

def cmd(s):
    print(s)
    if os.system(s):
        raise RuntimeError

def chdir():
    os.chdir(os.path.split(os.path.abspath(__file__))[0])
