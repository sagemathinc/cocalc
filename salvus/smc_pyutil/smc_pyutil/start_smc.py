#!/usr/bin/python

import argparse, os, sys,time

parser = argparse.ArgumentParser(description="Run all SMC daemons")
parser.add_argument("--timeout", dest="timeout", type=int, default=0,
    help="kill all processes if there is no activity for this many *seconds* (use 0 to disable, which is the default)")
args = parser.parse_args()

SAGEMATHCLOUD=os.path.abspath(os.path.dirname(__file__))
os.environ['SAGEMATHCLOUD'] = SAGEMATHCLOUD

DATA=os.path.join(SAGEMATHCLOUD, 'data')
if not os.path.exists(DATA):
    os.makedirs(DATA)

os.chdir(os.environ['HOME'])

def cmd(s):
    print s
    if os.system(". '%s'/sagemathcloud-env && "%SAGEMATHCLOUD + s):
       sys.exit(1)

root_link = os.path.join(SAGEMATHCLOUD, "root")
if not os.path.exists(root_link):
    try:
        cmd("cd '%s'; ln -s / root"%SAGEMATHCLOUD)
    except:
        print "WARNING: problem making root link"

#cmd("cd '%s' && ./make_coffee"%SAGEMATHCLOUD)


# Start local hub server:
cmd("local_hub start --timeout=%s"%args.timeout)


# Other servers
# We start sage server in the background, so the startups happen simultaneously, so quicker.
# We redirect to /dev/null to detach file descriptors so remote ssh can terminates
# without waiting for these (in case we want to return earlier, e.g., without waiting for sage server)
# Start console server:
#cmd("console_server start </dev/null >/dev/null 2>&1 &")

# Start sage_server
#cmd("sage_server    start  </dev/null >/dev/null 2>&1 &")

# Start IPython notebook server
# This doesn't behave well and ends up wasting massive resources in some cases.  Only enable if later fix.
# Startup is fast enough anyways.
#cmd("cd; ipython-notebook start </dev/null >/dev/null 2>&1 &")


# we only wait for local_hub and console -- not for sage_server, which can be broken by user with custom sage/python.
port_files = ["%s/data/%s.port"%(SAGEMATHCLOUD, s) for s in ['local_hub']]

def started():
    for p in port_files:
        if not os.path.exists(p):
            return False
    return True

i=0
while not started():
    time.sleep(0.1)
    i += 1
    print i,
    sys.stdout.flush()
    if i >= 150:
        sys.stderr.write("Error allocating network ports for local hub or console server -- giving up after 15 seconds.\n")
        sys.exit(1)
