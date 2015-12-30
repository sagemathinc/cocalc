#!/usr/bin/env python3
# -*- coding: utf8 -*-
###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, SageMathCloud Authors
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

# Authors:
# Harald Schilly <hsy@sagemath.com>

'''
This command-line utility gathers statistics and general information about a user's
project from "inside" the project.

Datapoints include:
* processes
* process classifications
* metrics for time/cpu/memory/...
* etc.

The output is JSON encoded data, which is used by the SMC UI, or text.

Notes:
* Assumption, that this is run with cgroups accounting,
  where the group is the username.
* All memory related units are in kibibytes (IEC 80000-13:2008).
* All time related units are seconds or UTC.
* Some values have human readable string counterparts, they are `*_h`.
'''
import os
from os.path import join
from json import load
from pytz import utc
from datetime import datetime
import psutil as ps
from dateutil.parser import parse as date_parser
from collections import OrderedDict, Counter, defaultdict

# byte -> ki(lo/bi)byte; see IEC 80000-13:2008
KBMB = 1024.

# cgroup stats accounts cpu usage in "USER_HZ" units - usually 1/100th second.
USER_HZ = float(os.sysconf(os.sysconf_names['SC_CLK_TCK']))

try:
    SMC_INFO = load(open(join(os.environ["SMC"], "info.json"), 'r'))
    PROJECT_ID = SMC_INFO.get("project_id")
except:
    PROJECT_ID = None


def secs2hms(secs, as_string=True):
    '''
    Convert seconds into hours, minutes, seconds or a human readable string.
    '''
    h = int(secs // 60**2)
    m = int((secs // 60) % 60)
    s = secs % 60
    if as_string:
        if h > 0:
            # rounding
            if s > 30:
                m += 1
                if m == 60:
                    h += 1
            hms = "{h:d}h{m:02d}m"
        elif m > 0:
            hms = "{m:d}m{s:02.0f}s"
        else:
            hms = "{s:5.2f}s"
        return hms.format(**locals())
    else:
        return h, m, s


def mb2human(mb):
    return kb2human(mb * KBMB)


def byte2human(b):
    return kb2human(b / KBMB)


def kb2human(kb):
    '''
    Convert a standard kilobyte value to larger units – similar to how '-h' switches do it.
    '''
    if kb > KBMB**2:
        return "{:.2f}GiB".format(kb / KBMB**2)
    elif kb > KBMB:
        return "{:.2f}MiB".format(kb / KBMB)
    return "{:.2f}KiB".format(kb)


def run(*cmd):
    from subprocess import Popen, PIPE
    p = Popen(cmd, stdout=PIPE)
    (output, err) = p.communicate()
    ec = p.wait()
    if ec == 0:
        return output
    else:
        raise Exception(err)


def read(fn):
    with open(fn, "r") as f:
        ret = f.read()
    return ret

# This is a classification mechanism for tasks.
CATEGORY = [
    "SMC Project",
    "SageMath",
    "Terminal",
    "Jupyter",
    "SMC Management",
    "Other"]


def classify_proc(proc):
    '''
    proc is a process, proc.cmdline is an array
    '''
    name = proc.name()
    cmd = proc.cmdline()

    if len(cmd) >= 3:
        if name == "node":
            if "smc-project/local_hub.coffee" in cmd[-1]:
                return CATEGORY[0]

        elif name == "nodejs":
            if "smc-project/console_server_child.coffee" in cmd[-1]:
                return CATEGORY[2]
            elif "forever/bin/monitor" in cmd[1]:
                return CATEGORY[4]

        elif name in ["python", "python3"]:
            if "smc_sagews.sage_server_command_line" in cmd[-1]:
                return CATEGORY[1]
            elif cmd[1].endswith('ipython') and cmd[2] == 'notebook':
                return CATEGORY[3]
    # fallback
    return "{}/{}".format(CATEGORY[-1], name)


class SmcTop(object):
    """
    Usage: class-instantiation → call `<obj>.json()` for a serialization of it.
    Expected runtime is ~4 seconds, because it has to sample the CPU usage.
    """

    def __init__(self,
                 userid=None,
                 sample_interval=3.0,
                 tree=False,
                 summarize=False):
        from os import getuid
        from pwd import getpwuid
        self.summarize = summarize
        if userid is None:
            self.userid = getpwuid(getuid()).pw_name

        # used for measuring % cpu usage, in seconds
        self.sample_interval = sample_interval
        self._calc_tree = tree

        # state variables
        self._proc_stats = None
        self._procs = None
        self._tree = None
        self._totals = None

    def totals(self):
        """
        This uses kernel accounting (or cgroup accounting) directly.
        Calculating sums of the reported values might differ.
        """

        def add_human_readable(d, converter=mb2human):
            # list, because dict changes size
            for k, v in list(d.items()):
                d.update({"%s_h" % k: converter(v)})

        def memory(impl="cgroup"):
            '''
            On SMC, all projects are in a cgroup. That's the preferred
            implementation used.

            TODO: there is no fallback if there is no cgroup for a user
            and `smem` is not used either.
            '''
            if impl == "smem":
                # smem is in kilobytes
                try:
                    # User     Count     Swap      USS      PSS      RSS
                    smem = run("/usr/bin/smem", "-uH").split()[2:]
                    smem = [int(_) / KBMB for _ in smem]
                    smem = dict(zip(["swap", "uss", "pss", "rss"], smem))
                    add_human_readable(smem)
                    return smem
                except Exception as e:
                    return {"error": str(e)}

            elif impl == "cgroup":
                # cgroups is in bytes
                try:
                    # memory usage and limits
                    memstat = "/sys/fs/cgroup/memory/%s/memory.stat" % self.userid
                    cg_mem = read(memstat).splitlines()
                    mem = dict(_.split() for _ in cg_mem)
                    conv = lambda x: float(x) / KBMB**2

                    rss = conv(mem['total_rss'])
                    swap = conv(mem["total_swap"])
                    mem_max = conv(mem['hierarchical_memory_limit'])
                    swap_max = conv(mem['hierarchical_memsw_limit']) - mem_max
                    total = rss + swap
                    total_max = mem_max + swap_max

                    vals = {
                        "rss": rss,
                        "swap": swap,
                        "total": total,
                        "mem_max": mem_max,
                        "swap_max": swap_max,
                        "total_max": total_max,
                    }
                    add_human_readable(vals)
                    # no human readable version
                    vals["percent"] = 100. * float(total / total_max)
                    return vals
                except IOError as e:
                    return {"error": str(e)}

        def cpu():
            try:
                # cpu usage and limits
                cpuacct = "/sys/fs/cgroup/cpu,cpuacct/%s/cpuacct.stat" % self.userid
                cg_cpu = read(cpuacct).splitlines()
                cpu = dict(_.split() for _ in cg_cpu)
                s = float(cpu["system"]) / USER_HZ
                u = float(cpu["user"]) / USER_HZ
                t = s + u
                vals = {
                    'system': s,
                    'user': u,
                    'total': t,
                }
                add_human_readable(vals, secs2hms)
                return vals
            except IOError as e:
                return {"error": str(e)}

        self._totals = {
            "mem": memory(),
            "cpu": cpu()
        }
        return self._totals

    def user_processes(self):
        '''
        Returns an iterator over all processes of the given user.
        '''
        for p in ps.process_iter():
            if p.username() != self.userid:
                continue
            yield p

    def capture(self):
        """
        The current state of all processes of a given user.
        By default, the current user is taken and analyzed.
        """
        if self._totals is None:
            self.totals()
        if self._totals is None:
            return {"error": "no totals available"}

        from time import sleep

        self.now = now = datetime.utcnow().replace(tzinfo=utc)
        cpu_pct_sum = 0.0
        cpu_time_sum = 0.0

        if self._calc_tree:
            # used to build the process tree
            par_ch = defaultdict(list)
        procs = []
        # sum up process categories
        proc_stats = defaultdict(lambda: defaultdict(lambda: 0.0))
        # reset all instance counters to 0
        for proc_class in CATEGORY:
            proc_stats[proc_class]["instances"] = 0

        # cpu_percent needs to be called twice for meaningful values
        for p in self.user_processes():
            p.cpu_percent()
        sleep(self.sample_interval)

        def check(fn):
            try:
                return fn()
            except ps.AccessDenied:
                return None

        for p in self.user_processes():
            io = check(p.io_counters)
            mem = p.memory_info_ex()

            # relative cpu time usage
            cpu_times = p.cpu_times()
            time_rel = cpu_times.user + cpu_times.system

            # absolute cpu time usage
            start = datetime.fromtimestamp(p.create_time()).replace(tzinfo=utc)
            time_abs = (now - start).total_seconds()

            # memory in pct of cgroup limit, exclucing swap.
            # i.e. a value near or above 100% indicates excessive usage
            if not "error" in self._totals["mem"]:
                mem_pct = 100. * mem.rss / KBMB**2 / self._totals["mem"]["mem_max"]
            else:
                mem_pct = 0.

            proc_class = classify_proc(p)
            proc_stats[proc_class]["instances"] += 1
            proc_stats[proc_class]["cpu"] += p.cpu_percent()
            proc_stats[proc_class]["mem"] += mem_pct
            proc_stats[proc_class]["time"] += time_rel

            if self._calc_tree:
                for chpid in [ch.pid for ch in p.children()]:
                    par_ch[p.pid].append(chpid)

            procs.append({
                "pid": p.pid,
                # funny thing: name, path and cmdline can be uneqal
                "name": p.name(),
                # The process executable as an absolute path.
                "path": check(p.exe),
                "category": proc_class,
                "command_line": p.cmdline(),
                "open_files": check(p.num_fds),
                #"threads": p.threads(),
                "read": io.read_bytes if io else 0,
                "write": io.write_bytes if io else 0,
                "cpu_percent": p.cpu_percent(),
                "time": {
                    "started": datetime.isoformat(start),
                    "absolute": time_abs,
                    "absolute_h": secs2hms(time_abs),
                    "used": time_rel,
                    "used_h": secs2hms(time_rel),
                    "percent": 100. * time_rel / time_abs,
                },
                "memory": {
                    "real": mem.rss / KBMB**2,
                    "virtual": mem.vms / KBMB**2,
                    "shared": mem.shared / KBMB**2,
                    "percent": 100. * mem_pct,
                }
            })

        if self._calc_tree:
            tree = defaultdict(dict)
            for par, chlds in par_ch.items():
                for ch in chlds:
                    tree[par][ch] = tree[ch]

            roots = set(tree.keys())
            for ch in tree.values():
                for p in ch.keys():
                    roots.remove(p)
            self._tree = [{r: tree[r]} for r in roots]

        self._procs = procs
        for c in proc_stats: # type for instance counter is 'int'
            proc_stats[c]["instances"] = int(proc_stats[c]["instances"])
        self._proc_stats = proc_stats
        return self._procs, self._tree, self._proc_stats

    def data(self):
        '''
        stitch together the gathered data
        '''
        from datetime import datetime

        self.capture()

        data = {
            "timestamp": datetime.isoformat(self.now),
            "username": self.userid,
            "totals": self._totals,
            "processes": self._procs,
            "summaries": self._proc_stats,
        }

        if self._calc_tree:
            data["tree"] = self._tree

        # add project_id if available
        if PROJECT_ID is not None:
            data["project_id"] = PROJECT_ID

        return data

    def json(self, indent=None):
        '''
        Generates a JSON datastructure of the gathered information.
        '''
        import json
        data = self.data()
        if indent == 0:
            indent = None
        return json.dumps(data, indent=indent)

    def text(self, sortby=None, width=130):
        from io import StringIO
        from itertools import groupby
        from textwrap import wrap

        ret = StringIO()
        data = self.data()
        I = "   "

        def print0(*args, **kwds):
            sep = kwds.get('sep', ' ')
            nl = kwds.get('nl', True)
            ret.write(sep.join(args))
            if nl:
                ret.write('\n')
        
        if sortby == "mem":
            sortkey = lambda x: - x["memory"]["percent"]
        elif sortby == "cpu":
            sortkey = lambda x: - x["cpu_percent"]
        elif sortby == "auto":
            sortkey = lambda x: - max(x["cpu_percent"],
                                      x["memory"]["percent"])
        elif sortby == "time":
            sortkey = lambda x: - x["time"]["used"]
        else:
            # default is by pid
            sortkey = lambda x: x["pid"]

        ts = date_parser(data["timestamp"]).strftime("%Y-%m-%d %H:%M:%S")
        print0(" SageMathCloud Process Accounting -- {} UTC "
              .format(ts).center(width, "="))
        print0()
        if self.summarize:
            print0("{} {:>6s} {:>14s} {:>7s} {:>7s} {:>13s}"
                  .format(I, "", "#", "CPU%", "MEM%", "TIME+"))
        else:
            print0("{} {:>6s} {:<12s} {:>7s} {:>7s} {:>13s}   {:s}"
                  .format(I, "PID", "Name", "CPU%", "MEM%", "TIME+", "COMMAND"))
        print0(width * "-")

        cat_fn = lambda x: x["category"]

        def cat_fn_sorted(x):
            # sort categories by CATEGORY list
            cat = cat_fn(x)
            return CATEGORY.index(cat.split("/", 1)[0]), cat

        procs_by_cat = sorted(data["processes"], key=cat_fn_sorted)
        for cat, procs in groupby(procs_by_cat, cat_fn):
            print0("{:20s}  ".format(cat), nl=not self.summarize)
            for p in sorted(procs, key=sortkey):
                if not self.summarize:
                    line = '{} {pid:>6d} {name:<12s} {cpu_percent:>6.1f}% {memory[percent]:>6.1f}% {time[used_h]:>13s}'
                    print0(line.format(I, **p), nl=False)

                    cltxt = ' '.join(p["command_line"])
                    # corner case: no command_line entries
                    if len(cltxt) == 0:
                        print0("")
                    for l, idx in enumerate(range(0, len(cltxt), 80)):
                        indent = 3 if l == 0 else (width - 74)
                        print0("{}{}".format(" " * indent, cltxt[idx:idx + 80]))

            if self.summarize:
                sums = data["summaries"][cat]
                sums["time"] = secs2hms(sums["time"])
                print0("{instances:>3.0f} {cpu:>6.1f}% {mem:>6.1f}% {time:>13s}"
                      .format(**sums))

        totals = data["totals"]
        print0()
        print0(" Total Resource Usage ".center(width, "="))
        print0("Processes:       {}".format(len(data["processes"])))
        try:
            print0("CPU time used:   {cpu[total_h]:s} \
(sys:{cpu[system_h]} + user:{cpu[user_h]})".format(**totals))
            print0("MEM consumption: {mem[total_h]:s} of \
{mem[total_max_h]:s} ({mem[percent]:.1f}%)".format(**totals))
        except:
            print0("CPU/MEM: <no cgroup information>")
        #print0("  SUMS: {}".format(data["summaries"]))
        return ret.getvalue()


def parse_arguments():
    from argparse import ArgumentParser, ArgumentDefaultsHelpFormatter
    parser = ArgumentParser(formatter_class=ArgumentDefaultsHelpFormatter)
    paa = parser.add_argument

    paa("--tree",
        action="store_true",
        help="also generate a process tree")

    paa("--format",
        help="the output format",
        default="json",
        metavar="FMT",
        choices=["json", "text"])

    paa("--indent",
        help="Number of spaces for indentation,\
        e.g. used for JSON serialization",
        default=1,
        type=int,
        metavar="SPACES")

    paa("--user",
        metavar="USER",
        dest="userid",
        help="accounting for the given user, defaults to current user")

    paa("--interval",
        default=3.0,
        metavar="SECS",
        dest="sample_interval",
        type=float,
        help="sampling interval in seconds")

    paa("--summarize",
        default=False,
        action="store_true",
        help="If set to true, the process stats\
        will be shown up per category in 'text' format.")

    paa("--sort",
        metavar="COL",
        dest="sortby",
        help="sort text output by this column",
        default="auto",
        choices=sorted(["mem", "cpu", "time", "pid", "auto"]))

    return parser.parse_args()


def main():
    args = parse_arguments()
    format = args.__dict__.pop("format")
    sortby = args.__dict__.pop("sortby")
    indent = args.__dict__.pop("indent")
    top = SmcTop(**args.__dict__)
    if format == "json":
        return top.json(indent=indent)
    elif format == "text":
        return top.text(sortby=sortby)

if __name__ == "__main__":
    out = main()
    from sys import stdout
    stdout.write(out)
    stdout.write("\n")
    stdout.flush()
