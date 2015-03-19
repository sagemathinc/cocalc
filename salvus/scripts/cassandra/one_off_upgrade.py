
# RUN via
#   python ~/salvus/salvus/scripts/cassandra/one_off_upgrade.py smc4dc5
import sys
host=sys.argv[1]

sys.path.append("/home/salvus/salvus/salvus/")

import admin; reload(admin); a = admin.Services('conf/deploy_smc/', password='')
import time

def run_on(s, timeout=120):
    print s
    v = a._hosts(host, s, timeout=timeout)
    print v.values()[0]['stdout']
    print v.values()[0]['stderr']
    if v.values()[0]['exit_status'] != 0:
        raise RuntimeError

run_on('cd ~/salvus/salvus && . salvus-env && ./build.py --build_cassandra && nodetool drain', timeout=600)
a.stop('cassandra', host=host, wait=False)
print "waiting 15 seconds..."
time.sleep(15)

run_on('cd /mnt/cassandra && rm -rf log && mv data data.DELETE && mv lib data && ln -s /home/salvus/salvus/salvus/data/local/cassandra/lib/ . && cd && rm system.log && cd logs && ln -s /mnt/cassandra/logs/system.log cassandra.log')

a.start('cassandra', host=host, wait=False)

t0 = time.time()
while True:
    try:
        run_on('tail logs/cassandra.log')
        run_on("cd salvus/salvus; . salvus-env; nodetool status")
        break
    except:
        print "Waiting for %s to start up... (elapsed time=%s minutes)"%(host, (time.time()-t0)/60.0)
        time.sleep(20)

