#!/usr/bin/env python3
# manages the build of the smc-project images
import sys
import os
import argparse
import inspect

VOL = '--volume=/ext:/ext'

def tag(name):
    version = os.environ.get('VERSION', 'latest')
    return '{name}:{version}'.format(**locals())

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


def run_hello(*args):
    print("hello: {args}".format(**locals()))



def main(action, *args):
    print("Running {action} with arguments {args}".format(**locals()))
    globals()['run_%s'%action](*args)

if __name__=='__main__':
    funcs = inspect.getmembers(sys.modules[__name__])
    actions = [name[4:] for name,obj in funcs if name.startswith('run_')]
    parser = argparse.ArgumentParser()
    parser.add_argument("action", help="what to do", choices=actions)
    parser.add_argument("args", help="optional arguments to the given action", nargs='*')
    args = parser.parse_args()
    main(args.action, *args.args)
