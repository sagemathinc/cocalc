import argparse, hashlib, os, random, time
from subprocess import Popen, PIPE

def cmd(s):
    print s
    out = Popen(s, stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=not isinstance(s, list))
    x = out.stdout.read() + out.stderr.read()
    e = out.wait()
    return x

def all_projects(filename='projects'):
    return [x.strip() for x in open(filename).readlines() if x.strip()]

def rebuild(project_id):
    if 'does not exist' not in cmd("zfs list projects-new/%s"%project_id):
       print "%s already done"%project_id
       return
    if project_id in ''.join(cmd('ps ax')):
       print "skipping since %s is in progress, evidently"%project_id
       return
    v = cmd("zfs list -r -t snapshot projects/%s|tail -1"%project_id).split()
    print v
    if len(v) < 2:
       return # nothing to do
    try:
        cmd("time zfs send -Rv %s 2>>log | mbuffer -s 256k -m 8G -o - | zfs recv -vu projects-new/%s 2>>log"%(v[0], project_id))
    except:
        cmd("zfs destroy -r projects-new/%s"%project_id)

def rebuild_all(filename='projects', reverse=False):
    i = 0
    t0 = time.time()
    v = all_projects(filename=filename)
    if reverse:
        v = list(reversed(v))
    for p in v:
        i += 1
        print "%s / %s: %s"%(i,len(v), p)
        t = time.time()
        rebuild(p)
        print (time.time()-t)/60, "   (total time=%s minutes)"%((time.time()-t0)/60)
