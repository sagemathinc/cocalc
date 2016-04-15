#!/usr/bin/env python2
# coding: utf8
from __future__ import print_function, division
from dateutil.parser import parse as parse_date
from datetime import datetime, timedelta #, timezone
import re
import os
import mmap
import socket
import sys
import pytz
from numpy import median

sys.path.insert(0, os.path.expanduser("~/custom_metric/"))
from record_metric import make_data, submit_data


HOST             = socket.gethostname()
time_window      = timedelta(seconds = 60)
pat_concurrent   = re.compile(r'\[(\d+) concurrent\]')
pat_modified     = re.compile(r'\[(\d+) modified\]')
pat_query_ms     = re.compile(r'\stook (\d+)ms;')
pat_blocked      = re.compile(r'BLOCKED for (\d+)ms')
pat_changefeeds  = re.compile(r'num_feeds=(\d+)\schangefeeds')
# client=sWBADKByX5l4xBPcAAL8: [48 mesg_time_ms]  [37 mesg_avg_ms] -- mesg.id=01f5cee3-9bfb-4cc9-bb1e-cf83798eb732
pat_mesg_time    = re.compile(r'\[(\d+) mesg_time_ms\]')
# see https://github.com/sagemathinc/smc/issues/507
pat_error1       = re.compile(r'.*error calling compute server -- error writing to socket -- socket no.*')
pat_hub_fn       = re.compile(r'hub(\d+).log')

#def tail(fn, lines=5000):
#    import subprocess as sp
#    cmd = "tail -n %d '%s'" % (lines, fn)
#    data = sp.Popen(cmd, shell=True, stdout=sp.PIPE).stdout
#    #yield from data.readlines()
#    for line in data.readlines():
#        yield line

def tail(filename, lines=5000):
    """
    Returns last n lines from the filename. No exception handling.

    Credits: http://stackoverflow.com/a/6813975
    """
    size = os.path.getsize(filename)
    with open(filename, "rb") as f:
        # for Windows the mmap parameters are different
        fm = mmap.mmap(f.fileno(), 0, mmap.MAP_SHARED, mmap.PROT_READ)
        try:
            for i in xrange(size - 1, -1, -1):
                if fm[i] == '\n':
                    lines -= 1
                    if lines == -1:
                        break
            return iter(fm[i + 1 if i else 0:].splitlines())
        finally:
            fm.close()

def grep(lines, *strings):
    # py3k: .replace(tzinfo=timezone.utc)
    start_ts = datetime.utcnow().replace(tzinfo=pytz.utc) - time_window
    skipped = 0
    for line in lines:
        line = line.decode("utf8")
        # print(line[:25])
        try: # sometimes there are newlines in the log and parse_date stumbles
            ts = parse_date(line[:25])
            if any(s in line for s in strings):
                if ts > start_ts:
                    yield ts, line
                else:
                    skipped += 1
        except:
            pass
    if skipped == 0:
        sys.stderr.write("WARNING: you have to increase the number of lines in tail\n")

if __name__=="__main__":
    import sys
    if len(sys.argv) <= 1:
         raise Exception("first argument must be one or more log files, e.g. $HOME/logs/hub.log")

    logfiles = sys.argv[1:]

    data = []
    for fn in logfiles:
        concs    = [] # concurrent numbers
        modifs   = [] # modified documents numbers
        mss      = [] # query millisecond numbers
        blocked  = [] # list of BLOCKED numbers
        cfs      = [] # changefeed numbers, maximum is interesting
        msgtimes = [] # mesg_time_ms, maximum is interesting

        # for query per seconds
        ts_first_query  = None
        ts_last_query   = None
        query_count     = 0
        error1_count    = 0

        for ts, line in grep(tail(fn), "concurrent", "BLOCKED", "FEED",  "mesg_time_ms", "error"):
            if "BLOCKED" in line:
                b = pat_blocked.findall(line)
                if len(b) > 0:
                    blocked.append(int(b[0]))

            elif "FEED" in line:
                cf = pat_changefeeds.findall(line)
                if len(cf) > 0:
                    cfs.append(int(cf[0]))

            elif "mesg_time_ms" in line:
                mt = pat_mesg_time.findall(line)
                if len(mt) > 0:
                    msgtimes.append(int(mt[0]))

            elif "concurrent" in line:
                conc = pat_concurrent.findall(line)
                if len(conc) > 0:
                    concs.append(int(conc[0]))
                modif = pat_modified.findall(line)
                if len(modif) > 0:
                    modifs.append(int(modif[0]))
                ms = pat_query_ms.findall(line)
                if len(ms) > 0:
                    mss.append(int(ms[0]))

                # queries per second. this is derived from the "concurrent" lines by
                # counting lines containing 'rethink: query -- ' and dividing by the time interval
                if 'rethink: query -- ' in line:
                    if ts_first_query is None:
                        ts_first_query = ts
                    ts_last_query = ts
                    query_count += 1

            elif "error" in line:
                err = pat_error1.match(line)
                if err:
                    error1_count += 1

        concurrent   = max(concs)           if concs else 0
        modified     = float(sum(modifs))   if modifs else 0.0
        ms_median    = median(mss)          if mss else 0.0
        ms_max       = float(max(mss))      if mss else 0.0
        ms_sum       = float(sum(mss))      if mss else 0.0
        blocked      = float(max(blocked))  if blocked else 0.0
        cf_max       = float(max(cfs))      if cfs else None
        msgtimes_max = float(max(msgtimes)) if msgtimes else None

        #print("query median in ms: %s" % ms_median)
        #print("query max in ms: %s" % ms_max)

        logfile = os.path.basename(fn)

        data.append(make_data("hub_concurrent", concurrent,                  host=HOST, logfile=logfile))
        data.append(make_data("hub_query_ms",   ms_median,    kind="median", host=HOST, logfile=logfile))
        data.append(make_data("hub_query_ms",   ms_max,       kind="max",    host=HOST, logfile=logfile))
        data.append(make_data("hub_query_ms",   ms_sum,       kind="sum",    host=HOST, logfile=logfile))
        data.append(make_data("blocked",        blocked,      kind="max",    host=HOST, logfile=logfile))
        if cf_max is not None:
            data.append(make_data("changefeeds",cf_max,       kind="max",    host=HOST, logfile=logfile))
        if msgtimes_max is not None:
            data.append(make_data("mesg_times", msgtimes_max, kind="max",    host=HOST, logfile=logfile))

        # calc query per second
        if ts_first_query is not None and ts_first_query != ts_last_query:
            tdelta = (ts_last_query - ts_first_query).total_seconds()
            qps = float(query_count) / tdelta
            modified_per_min = float(modified) / (tdelta / 60)
            data.append(make_data("hub_queries_per_second", qps, host=HOST, logfile=logfile))
            data.append(make_data("hub_modified", modified_per_min, kind="sum", host=HOST, logfile=logfile))
            # print("qps: %f [ms]" % qps)

        hub_no = pat_hub_fn.findall(logfile)
        if len(hub_no) > 0:
            hub_no = hub_no[0]
            if error1_count > 10:
                print("error1_count: %s → restarting hub %s" % (error1_count, hub_no))
                os.system('/home/salvus/smc/src/restart_hub %s' % hub_no)

        # END: for loop over logfiles

    # submit everything at once, because there is a daily quota limit of the API
    submit_data(*data)

    #cmd = '/usr/bin/python $HOME/custom_metric/record_metric.py hub_concurrent host=$(hostname) logfile=%s %d' % (os.path.basename(fn), concurrent)
    #print(cmd)
    #os.system(cmd)
