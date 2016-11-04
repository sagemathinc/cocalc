#!/usr/bin/env python
from prometheus_client import start_http_server, Summary, Gauge
import random
import time

# number of cores only set once
import multiprocessing
num_cpus = Gauge('num_cpus', 'number of cpu cores')
num_cpus.set(multiprocessing.cpu_count())

# time to pause after each run in the main loop
LOOP_SLEEP_s = 5

# Create a metric to track time spent and requests made.
FAKE_METRIC = Summary('fake_compute_metric', 'just for testing ...')
RUNNING_PROCS = Summary('running_process_stats', 'how long it takes to tally up the running processes')
g_proj = Gauge('num_projects', "Number of running projects")
g_sage = Gauge('num_sage', "number of running sagemath instances")
g_ipynb  = Gauge('num_ipynb', "number of running jupyter server instances")

SAGEWS_CMDLINE = "from smc_sagews.sage_server_command_line"

@RUNNING_PROCS.time()
def running_process_stats():
    import psutil as ps
    """
    filter all root processes for running projects
    """
    nb_projects = 0
    nb_sage = 0
    nb_ipynb = 0
    for p in ps.process_iter():
        try:
            if p.name() in ["node", "nodejs"]:
                cmd = p.cmdline()
                if len(cmd) == 3:
                    if "monitor" in cmd[1] and "smc-project/local_hub.coffee" in cmd[2]:
                        nb_projects += 1
            if p.name() in ["python", "python3", "ipython", "ipython3"]:
                cmd = p.cmdline()
                if len(cmd) < 3:
                    continue
                if SAGEWS_CMDLINE in cmd[-1]:
                    # also check, if parent process is sagemath, since all sagews instances are forked
                    # (otherwise, it's always one too many per project)
                    cmdpar = p.parent().cmdline()
                    if len(cmdpar) > 1 and SAGEWS_CMDLINE in cmdpar[-1]:
                        nb_sage += 1
                elif cmd[2] == 'notebook':
                    nb_ipynb += 1
        except ps.NoSuchProcess:
            # sometimes they're already gone
            pass

    return nb_projects, nb_sage, nb_ipynb

# Decorate function with metric.
@FAKE_METRIC.time()
def process_request(t):
    """A dummy function that takes some time."""
    time.sleep(t)

if __name__ == '__main__':
    # Start up the server to expose the metrics.
    start_http_server(9090)
    # Generate some requests.
    while True:
        process_request(random.random())
        time.sleep(LOOP_SLEEP_s)
        p, s, i = running_process_stats()
        g_proj.set(p)
        g_sage.set(s)
        g_ipynb.set(i)


