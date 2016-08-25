#!/usr/bin/env python3
# manages the build of the smc-project images
import sys
import os
from os.path import join, expanduser
import argparse
import inspect

SCRIPT_PATH = os.path.split(os.path.realpath(__file__))[0]
os.chdir(SCRIPT_PATH)
sys.path.insert(0, os.path.abspath(os.path.join(SCRIPT_PATH, '..', 'util')))
import util

import re
TAGID_PATTERN = re.compile(r'^[a-z_-]+$')

VOL = '--volume=/ext:/ext'


def tag(name):
    version = os.environ.get('VERSION', 'latest')
    return '{name}:{version}'.format(**locals())


def create_tag(name='smc-project-base', tagid = None, incr='minor'):
    '''
    encoding the rebuilds and individual updates for the base image as %03d-%03d
    this makes the version number meaningful and also sortable.

    Additionally, there is an optional `tagid` parameter, which will be appended to the
    tag like 000-000-tagid. It must be lowercase and dash+underscore only. It is primarily
    for semantic information or quickly referencing the most recent tag based on it.
    '''
    assert incr in ['minor', 'major']
    if tagid:
        assert TAGID_PATTERN.match(tagid), "tagid needs to be lowercase and contain - and _ only"
    if last:
        if incr == 'minor':
            last[1] += 1
        else:
            last = [last[0] + 1, 0]
    else:
        last = [0, 0]
    tag = '{:03d}-{:03d}'.format(*last)
    if tagid:
        tag += '-%s' % tagid
    return tag


def latest_tag(name='smc-project-base', tagid = None):
    '''
    @return if there is no suitable tag, it will return None!
    '''
    assert TAGID_PATTERN.match(tagid)
    tags = util.run(['docker', 'images', name, '--format={{.Tag}}'], get_output=True)
    if not tags:
        return None
    tags = tags.splitlines()

    def get_versions(tag):
        try:
            ids = tag.split('-', 2)
            if tagid and len(ids) == 3 and ids[2] != tagid:
                return None
            return [int(_) for _ in ids[:2]]
        except:
            return None
    return sorted([get_versions(_) for _ in tags if _ is not None])[-1]


def run_run(name):
    TAG = tag(name)
    RUN = 'docker run -it "{VOL}" "{TAG}"'.format(VOL=VOL, TAG=TAG)
    print(RUN)

    # CREATE   = docker create -it "${VOL}" "${TAG}"
    # COMMIT   = docker commit ${ID} ${TAG}


def run_create(name):
    print('docker create -it "${VOL}" "${TAG}"'.format(VOL=VOL, TAG=tag(name)))


def run_tag(name, version):
    # ID =  docker images --quiet --no-trunc ${NAME}:latest
    # docker tag ${ID} ${NAME}:${version}
    pass


def run_base(action=None):
    base_actions = ['rebuild', 'update', 'test', 'squash']
    if action is None or action not in base_actions:
        print("possible actions for base image: {}".format(base_actions))
    if action == 'rebuild':
        tag = create_tag(incr='major')
        print("building new base image with tag {}".format(tag))
    elif action == 'update':
        tag = create_tag(incr='minor')
        print("updating base image to tag {}".format(tag))
    elif action == 'test':
        tag = latest_tag()
        print("running test on {}".format(tag))
        # after running test
        # docker cp [container_id]:/home/salvus/smc-compute-env.html
        # expanduser('~')


def run_clean():
    '''
    tells docker to clean up itself (dangling images, dead containers, ...)
    '''
    print("cleaning up no longer needed docker containers (not all of them, since it isn't forced!)")
    container = util.run(['docker', 'ps', '-aq', '--no-trunc'], get_output=True)
    if container:
        util.run(['docker', 'rm'] + container.splitlines())
    print("now, let's also get rid of images that are no longer needed ...")
    while True:
        images = util.run(['docker', 'images', '-q', '--filter', 'dangling=true'])
        if not images:
            return
        util.run(['docker', 'rmi'] + images.splitlines())


def run_hello(*args, **kwargs):
    print("hello: {args} {kwargs}".format(args, kwargs))


def run_debug(what, *args):
    '''dummy target for testing'''
    print(globals()[what](*args))


def main(action, *args):
    print("Running {action} with arguments {args}".format(**locals()))
    globals()['run_%s' % action](*args)

if __name__ == '__main__':
    funcs = inspect.getmembers(sys.modules[__name__])
    actions = [name[4:] for name, _ in funcs if name.startswith('run_')]
    parser = argparse.ArgumentParser()
    parser.add_argument("action", help="what to do", choices=actions)
    parser.add_argument("args", help="optional arguments to the given action, also accepts [key=value] pairs", nargs='*')
    args = parser.parse_args()

    # transform arguments into positional and named arguments
    array = []
    kwds = {}
    for arg in args.args:
        if "=" in arg:
            k, v = arg.split("=", 1)
            kwds[k] = v
        else:
            array.append(arg)
    main(args.action, *array, **kwds)
