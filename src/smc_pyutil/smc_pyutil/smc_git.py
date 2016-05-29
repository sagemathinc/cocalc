#!/usr/bin/python
"""
(c) Tim Clemans, 2016


"""

import json, os, subprocess, sys, uuid

def current_branch():
    result = os.popen('git rev-parse --abbrev-ref HEAD 2> /dev/null || echo "master" ').read().strip('\n').split('\n')[-1]
    return result.strip()

def branches():
    results = os.popen('git branch').read().strip('\n').split('\n')
    results = [item.strip() for item in results if not item.startswith('*')]
    results = sorted(results)
    return json.dumps(results)

def changed_tracked_files():
    results = os.popen('git diff --name-only').read().strip('\n').split('\n')
    return json.dumps(results)

def changed_untracked_files():
    results = os.popen('git ls-files . --exclude-standard --others').read().strip('\n').split('\n')
    return json.dumps(results)

def compare_current_branch_with_upstream_master():
    results = os.popen('git diff %s upstream/master' % (current_branch())).read()
    return results

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('command')
    args = parser.parse_args()
    print globals()[args.command]()

if __name__ == "__main__":
    main()

