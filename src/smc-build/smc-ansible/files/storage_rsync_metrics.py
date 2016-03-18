#!/usr/bin/env python
# coding: utf8
"""
Get the number of concurrent rsyncs and report them as a custom metric.
"""
from __future__ import print_function, division
from dateutil.parser import parse as parse_date
from datetime import datetime, timedelta #, timezone
import re
import os
import socket
import sys
import pytz
from numpy import median
from time import time, sleep
from subprocess import check_output, CalledProcessError

sys.path.insert(0, os.path.expanduser("~/custom_metric/"))
from record_metric import make_data, submit_data, log_data

HOST = socket.gethostname()

def rsyncs():
    t0 = time()
    rsyncs = []
    while t0 + 10 > time():
        try:
            rsync = check_output(["pgrep", "-xc", "rsync"])
        except CalledProcessError as cpe:
            rsync = cpe.output
        rsyncs.append(int(rsync))
        sleep(1.0)

    # another idea is to use numpy.median, but "max" is probably more interesting
    # type must be float here!
    rsyncs = float(max(rsyncs))
    return rsyncs


if __name__=="__main__":

    # data acquisition
    rsyncs = float(rsyncs()) # we are recording double values

    # constructing timeseries
    data = []
    data.append(make_data("concurrent_rsyncs", rsyncs, kind="max", host=HOST)) ##, logfile=logfile))

    # submit everything at once, because there is a daily quota limit of the API
    submit_data(*data)


#md = '/usr/bin/python $HOME/monitor_rsyncs/record_metric.py concurrent_rsyncs host=$(hostname) %f' % rsyncs
#print(cmd)
#os.system(cmd)

