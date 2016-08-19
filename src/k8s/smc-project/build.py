#!/usr/bin/env python3
# manages the build of the smc-project images
import sys
import os
from os.path import join
import argparse
import inspect

SCRIPT_PATH = os.path.split(os.path.realpath(__file__))[0]
os.chdir(SCRIPT_PATH)
sys.path.insert(0, os.path.abspath(os.path.join(SCRIPT_PATH, '..', 'util')))
import util

VOL = '--volume=/ext:/ext'


def tag(name):
    version = os.environ.get('VERSION', 'latest')
    return '{name}:{version}'.format(**locals())

def create_tag(name = 'smc-project-base', incr = 'minor'):
    '''
    encoding the rebuilds and individual updates for the base image as %03d-%03d
    this makes the version number meaningful and also sortable
    '''
    assert incr in ['minor', 'major']
    if last:
        if incr == 'minor':
           last[1] += 1
        else:
           last = [last[0] + 1, 0]
    else:
        last = [0, 0]
    return '{:03d}-{:03d}'.format(*last)

def latest_tag(name = 'smc-project-base'):
    '''
    @return if there is no suitable tag, it will return None!
    '''
    tags = util.run(['docker', 'images', name, '--format={{.Tag}}'], get_output=True).splitlines()
    def get_versions(tag):
        try:
            return [int(_) for _ in tag.split('-', 1)]
        except:
            return None
    return sorted([get_versions(_) for _ in tags if _ is not None])[-1]


def run_run(name):
    TAG = tag(name)
    RUN = 'docker run -it "{VOL}" "{TAG}"'.format(VOL=VOL, TAG=TAG)
    print(RUN)

    #CREATE   = docker create -it "${VOL}" "${TAG}"
    #COMMIT   = docker commit ${ID} ${TAG}

def run_create(name):
    print('docker create -it "${VOL}" "${TAG}"'.format(VOL=VOL, TAG=tag(name)))

def run_tag(name, version):
    # ID =  docker images --quiet --no-trunc ${NAME}:latest
    # docker tag ${ID} ${NAME}:${version}
    pass

def run_base(action = None):
    base_actions = ['rebuild', 'update', 'test', 'squash']
    if action is None or action not in base_actions:
        print("possible actions for base image: {}".format(base_actions))
    if action == 'rebuild':
        tag = create_tag(incr = 'major')
        print("building new base image with tag {}".format(tag))
    elif action == 'update':
        tag = create_tag(incr = 'minor')
        print("updating base image to tag {}".format(tag))
    elif action == 'test':
        tag = latest_tag()
        print("running test on {}".format(tag))

def run_clean():
    '''
    tells docker to clean up itself (dangling images, dead containers, ...)
    '''
    print("cleaning up no longer needed docker containers (not all of them, since it isn't forced!)")
    container = util.run(['docker', 'ps', '-aq', '--no-trunc'], get_output=True).splitlines()
    util.run(['docker', 'rm'] + container)
    print("now, let's also get rid of images that are no longer needed ...")
    while True:
        images = util.run(['docker', 'images', '-q', '--filter', 'dangling=true']).splitlines()
        if not images:
           return
        util.run(['docker', 'rmi'] + images


def run_hello(*args):
    print("hello: {args}".format(**locals()))

def run_debug(what, *args):
    '''dummy target for testing'''
    print(globals()[what](*args))

def main(action, *args):
    print("Running {action} with arguments {args}".format(**locals()))
    globals()['run_%s'%action](*args)

if __name__=='__main__':
    funcs = inspect.getmembers(sys.modules[__name__])
    actions = [name[4:] for name, _ in funcs if name.startswith('run_')]
    parser = argparse.ArgumentParser()
    parser.add_argument("action", help="what to do", choices=actions)
    parser.add_argument("args", help="optional arguments to the given action", nargs='*')
    args = parser.parse_args()
    main(args.action, *args.args)
