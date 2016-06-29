#!/usr/bin/env python3
from glob import iglob
import json
import os
from dateutil.parser import parse as parse_ts
import socket
import bz2

os.chdir('/projects')


def chats():
    for fn in iglob('/projects/**/.*.sage-chat'):
        yield fn


def videochatlines():
    for fn in chats():
        with open(fn) as f:
            for line in f:
                if '"start_video"' in line:
                    yield fn, line


def videochats():
    for fn, line in videochatlines():
        data = json.loads(line)
        date = data.get('date', None)
        if date is not None:
            date = parse_ts(date)
        #print('data: {}'.format(data))
        d, _ = os.path.split(fn)
        proj = d.split(os.sep)[2]
        yield proj, date, fn



def collect():
    baselen = len('/projects/b97f6266-fe6f-4b40-bd88-9798994a04d1/')
    #from collections import defaultdict
    #entries = defaultdict(lambda: list)
    projs = set()
    hostname = socket.gethostname()
    with bz2.open('/home/salvus/tmp/video_chats-{}.csv.bz2'.format(hostname), 'wt') as out:
        for proj, date, fn in videochats():
            #entries[fn] += date
            projs.add(proj)
            fn = fn[baselen:].replace('"', r'\"')
            out.write('"{date}","{proj}","{fn}"\n'.format(**locals()))

    #print('len projs: %s' % len(projs))

if __name__ == '__main__':
    collect()
