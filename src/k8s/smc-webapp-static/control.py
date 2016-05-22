#!/usr/bin/env python3

"""
Eventually this is going to be a script that does things like takes as input a version,
then builds (defined by that version!), uploads it to gcloud,
and makes result live on cluster. (Rolling update).
However, it's really not clear how or what we want to do, until doing things
manually using kubectl, etc. for a while.  So this is just a start.
"""

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(help='sub-command help')

    sub = subparsers.add_parser('build', help='a help')  # https://docs.python.org/3/library/argparse.html#module-argparse
    sub.add_argument('bar', type=int, help='bar help')

    parser.parse_args()
