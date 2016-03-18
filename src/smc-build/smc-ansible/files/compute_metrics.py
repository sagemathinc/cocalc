#!/usr/bin/env python
# coding: utf8
"""
Get the number of projects and report them as a custom metric.
"""
# coding: utf8
from __future__ import print_function, division
from dateutil.parser import parse as parse_date
from datetime import datetime, timedelta #, timezone
import re
import os
import socket
import sys
import pytz
from numpy import median

sys.path.insert(0, os.path.expanduser("~/custom_metric/"))
from record_metric import make_data, submit_data, log_data

HOST = socket.gethostname()

### ACTIVE PROJECTS ###
# alternatively, just count the active users
# e.g. len(set(Popen(["ps", "-e", "-o", "user="], stdout=PIPE).stdout.readlines())) - 7

def running_process_stats():
    import psutil as ps
    """
    filter all root processes for running projects
    """
    nb_projects = 0
    nb_sage = 0
    nb_ipynb = 0
    for p in ps.process_iter():
        if p.name() in ["node", "nodejs"]:
            cmd = p.cmdline()
            if len(cmd) == 3:
                if "monitor" in cmd[1] and "smc-project/local_hub.coffee" in cmd[2]:
                    nb_projects += 1
        if p.name() in ["python", "python3", "ipython", "ipython3"]:
            cmd = p.cmdline()
            if len(cmd) < 3:
                continue
            if "smc_sagews.sage_server_command_line" in cmd[-1]:
                nb_sage += 1
            elif cmd[2] == 'notebook':
                nb_ipynb += 1

    return nb_projects, nb_sage, nb_ipynb


### BENCHMARK ###
from subprocess import Popen, PIPE
def benchmark(test, max_time=10):
    """
    * test: which one
    * max_time: sysbench has an upper limit, we set this to 5 secs as a safeguard
    """
    if test == "filesystem":
        return benchmark_filesystem()
    # use sysbench
    cmd = ["sysbench", '--max-time=5', '--test=%s' % test]
    if test == "memory":
        cmd.extend(['--memory-block-size=1K', '--memory-total-size=128M', '--memory-access-mode=rnd'])
    elif test == "cpu":
        cmd.extend(['--cpu-max-prime=250'])
    elif test == "threads":
        cmd.extend(['--thread-yields=20', '--thread-locks=4'])
    cmd.append("run")
    x = Popen(cmd, stdout=PIPE)
    lines = x.stdout.readlines()
    #print lines,
    for line in lines:
        if 'total time taken by event execution' in line:
            return float(line.split(':')[-1].strip())

def benchmark_filesystem(N = 5):
    """
    This little benchmark tests how fast files are written in 1K block increments
    (deliberately slow!), and directories are created one-by-one and deleted alltogether.
    The main overhead should be the metadata-accounting of the filesystem,
    and not the speed how fast large files can be written.
    """
    import tempfile
    import shutil
    import os
    from time import time

    t0 = time()
    try:
        tempdir = tempfile.mkdtemp(prefix="benchmark")
        # print tempdir
        for i in range(N):
            random_file = os.path.join(tempdir, "b-%06d.dat" % i)
            os.system("dd if=/dev/zero of=%s bs=1K count=50 > /dev/null 2> /dev/null" % random_file)
            os.remove(random_file)

            random_dir = os.path.join(tempdir, "b-%06d" % i)
            os.system("mkdir %s" % random_dir)

    finally:
        shutil.rmtree(tempdir)
    return time() - t0

def benchmark_repeat(test, N=20, filter_op=max, baseline = None):
    from time import sleep
    times = []
    for i in range(N):
        times.append(benchmark(test))
        sleep(0.02)
    b = filter_op(times)
    if baseline:
        b /= baseline
    return b

if __name__=="__main__":

    # data acquisition
    nbproj, nbsage, nbipynb = [float(_) for _ in running_process_stats()] # we are recording double values

    # constructing timeseries
    data = []
    # that's a bit stupid, should be name "instances" and kind="projects", "sagemath", ...
    # but don't change it, dependencies are all over the place -_-
    data.append(make_data("nb_projects", nbproj,  kind="single", host=HOST)) ##, logfile=logfile))
    data.append(make_data("nb_sagemath", nbsage,  kind="single", host=HOST)) ##, logfile=logfile))
    data.append(make_data("nb_ipynb",    nbipynb, kind="single", host=HOST)) ##, logfile=logfile))

    # only run benchmarks every 5 minutes
    if datetime.utcnow().minute % 5 == 0:
        benchmark_cpu      = benchmark_repeat("cpu",        baseline=0.0642)
        benchmark_mem      = benchmark_repeat("memory",     baseline=0.0549)
        benchmark_threads  = benchmark_repeat("threads",    baseline=0.0452)
        benchmark_fs       = benchmark_repeat("filesystem", baseline=0.0636818408966)

        data.append(make_data("benchmark",   benchmark_cpu,      kind="cpu",        host=HOST))
        data.append(make_data("benchmark",   benchmark_mem,      kind="memory",     host=HOST))
        data.append(make_data("benchmark",   benchmark_threads,  kind="threads",    host=HOST))
        data.append(make_data("benchmark",   benchmark_fs,       kind="filesystem", host=HOST))

    # submit everything at once, because there is a daily quota limit of the API
    submit_data(*data)
    log_data(data, logfile_prefix = "metrics")

