#!/usr/bin/env python
# coding: utf8

###                 !!! DON'T EDIT ME !!!                         ###
### This file is managed by Ansible via the smc-cluster-mgmt repo ###

"""
This script saves the number of concurrent rsync operations for monitoring purposes.

Arguments: <metric> [key=value...] <integer|float>

Requirements:

0. python2 only!

1. It requires a working "creds.dat" file for submitting the data to the monitoring API for stackdriver.
   There is a working creds.dat in the smc project where it has been developed (SMC ops)

2. $ pip install --user --update google-api-python-client

"""
from __future__ import print_function
import os
import psutil
# make process low priority for cpu and idle I/O class
os.nice(19)
psutil.Process(os.getpid()).ionice(ioclass=psutil.IOPRIO_CLASS_IDLE)
#
import time
import sys
from oauth2client import file
from apiclient.discovery import build
import httplib2
from pytz import utc
from dateutil.parser import parse as dtparse
from collections import defaultdict
from os.path import expanduser, join, exists
from os import makedirs
from pytz import utc
import socket
import yaml
#####

# global variables (don't change them)
PROJECT_ID = "137606465756" # sage-math-inc
CUSTOM_METRIC_DOMAIN = "custom.cloudmonitoring.googleapis.com"

# CUSTOM_METRIC_NAME = "test"


def get_service():
    # To obtain the `service`, one needs to have working creds.dat credentials
    # if it doesn't work, go back to the smc project and re-run the "auth.py"

    this_dir = os.path.dirname(os.path.realpath(__file__))
    storage = file.Storage(os.path.join(this_dir, 'creds.dat'))
    credentials = storage.get()
    if credentials is None or credentials.invalid:
        raise Exception("Someone has to run $ python auth.py --noauth_local_webserver")

    # Create an httplib2.Http object to handle our HTTP requests and authorize it with our good Credentials.
    http = credentials.authorize(httplib2.Http())
    service = build(serviceName="cloudmonitoring", version="v2beta2", http=http)

    return service


def make_data(name, value, **kwargs):

    # The current timestamp, used for start&end in the timeseries
    now_rfc3339 = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    timeseries_descriptor = {
        "project": PROJECT_ID,
        "metric": "%s/%s" %  (CUSTOM_METRIC_DOMAIN, name)
    }

    if len(kwargs) >= 0:
        timeseries_descriptor["labels"] = {}
        for k, v in kwargs.iteritems():
            k = "%s/%s" % (CUSTOM_METRIC_DOMAIN, k)
            timeseries_descriptor["labels"][k] = v

    # Specify a new data point for the time series.
    timeseries_data = {
        "timeseriesDesc": timeseries_descriptor,
        "point": {
            "start": now_rfc3339,
            "end": now_rfc3339,
        }
    }
    if isinstance(value, int):
        timeseries_data["point"]["int64Value"] = value
    else:
        timeseries_data["point"]["doubleValue"] = value

    return timeseries_data


def extract_data_yaml(dp):
    # yes, it's a bit stupid to extract this from here,
    # but that way it works in general
    name = dp["timeseriesDesc"]["metric"].split("/")[-1]
    labels = dict((k.split("/")[-1], v) for k, v in dp["timeseriesDesc"]["labels"].iteritems())
    ts = dtparse(dp["point"]["start"]).replace(tzinfo = utc)
    value = dp["point"].get("int64Value", None) or dp["point"].get("doubleValue")

    entry = {"name": name, "timestamp": ts, "value": value}
    if labels:
        entry["labels"] = labels
    return entry

def extract_data_csv(data):
    datasets = defaultdict(dict)
    for dp in data:
        ts = dtparse(dp["point"]["start"]).replace(tzinfo = utc, microsecond = 0)
        name = dp["timeseriesDesc"]["metric"].split("/")[-1] # benchmark or single
        labels = dict((k.split("/")[-1], v) for k, v in dp["timeseriesDesc"]["labels"].iteritems())
        kind = labels.get('kind', '?')
        # print("name: %s, kind: %s" % (name, kind))
        if kind == "single":  # special case for nb_sagemath, ...
            kind = name[3:]
            name = "instances"
        value = dp["point"].get("int64Value")
        # value must be a string!
        if value is None:
            dv = dp["point"].get("doubleValue")
            if name == "instances":
                value = '%d' % int(dv)
            else:
                value = '%f' % dv
        else:
            value = '%d' % value
        datasets[name]["timestamp"] = ts.isoformat()
        datasets[name][kind] = value

    csv = {}
    for name, data in datasets.iteritems():
        # sort by kind, and timestamp in the front
        header, line = zip(*sorted(data.items(), key = lambda x : (x[0] != 'timestamp', x[0])))
        csv[name] = (header, line)
    return csv

def log_data(data, logfile_prefix = None, logfile_path = "~/logs/", format = "csv", DELIM = ","):
    assert format in ["yaml", "csv"]
    if logfile_prefix is None:
        raise ValueError("you have to specify a logfile_prefix in the arguments")

    path = expanduser(logfile_path)
    if not exists(path):
        makedirs(path)

    def get_logfile_name(name = None):
        hostname = socket.gethostname()
        logfn = '%s.log' % '-'.join(x for x in [logfile_prefix, name, hostname] if x is not None)
        logfile_path = join(path, logfn)
        return logfile_path

    if format == "csv":
        datasets = extract_data_csv(data)
        for name, (header, line) in datasets.iteritems():
            lfn = get_logfile_name(name)
            first_line = not exists(lfn)
            with open(lfn, "a+") as logfile:
                if first_line:
                    logfile.write(DELIM.join('"%s"' % h for h in header))
                    logfile.write(os.linesep)
                logfile.write(DELIM.join(line))
                logfile.write(os.linesep)

    elif format == "yaml":
        with open(get_logfile_name(), "a+") as logfile:
            ds = [extract_data_yaml(_) for _ in data]
            y = yaml.dump(ds, default_flow_style=False, canonical=False)
            #print(y)
            logfile.write(y)


def submit_data(*data):
    # Submit the write request.
    service = get_service()
    request = service.timeseries().write(
        project=PROJECT_ID,
        body={"timeseries": data}
    )
    request.execute()


def main(*args):
    args = list(args)
    # print(args)
    name = args.pop(0)
    kwargs = {}
    for arg in args:
        if "=" in arg:
            k, v = arg.split("=", 1)
            kwargs[k] = v
    try:
        value = int(args[-1])
    except:
        value = float(args[-1])
    ts = make_data(name, value, **kwargs)
    submit_data(ts)


if __name__=="__main__":
    # The name and labels need to be defined first (can't be arbitrary)
    # CUSTOM_METRIC_NAME = "concurrent_rsyncs"
    # CUSTOM_METRIC_NAME = "test"

    from sys import argv, exit
    if len(argv) <= 2:
        print("""\
You have to specify the metric name (e.g. 'concurrent_rsyncs') as the first argument
The valid labels next, e.g. 'host=storage0'
and finally as the last argument the value which will be parsed as an integer
[fix me properly using argparse if that's not enough for you]
""")
        exit(1)
    main(*argv[1:])

