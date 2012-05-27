#!/usr/bin/env python

#######################################################################
#
# Copyright (c) 2012 William Stein, University of Washington
# Not for redistribution.
#
#######################################################################


import argparse, os, sys
from doctest import testmod, NORMALIZE_WHITESPACE, ELLIPSIS

def test_process(verbose=False):
    import process
    return testmod(process, optionflags=NORMALIZE_WHITESPACE | ELLIPSIS, verbose=verbose)[0]

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Run tests.")
    parser.add_argument('--verbose', dest='verbose', default='False',
                        help="run tests verbosely (default: False)")
    parser.add_argument('--modules', dest='modules', default='process',
                        help="modules to test (comma separated without spaces)")

    args = parser.parse_args()

    verbose = eval(args.verbose)
    modules = args.modules.split(',')

    failed_modules = []

    for name in modules:
        fname = 'test_' + name
        print "Testing module '%s'..."%name 
        if fname not in globals():
            failed_modules.append((name, "No module '%s'"%name))
        else:
            if os.fork() == 0:
                fail_count = globals()[fname](verbose=verbose)
                # Use the exit code to return the number of failures.
                sys.exit(fail_count)
            else:
                pid, exitcode = os.wait()
                # High byte of exitcode is the number of failures
                fail_count = exitcode >> 8
                if fail_count > 0:
                    failed_modules.append((name, "%s test%s failed"%(
                        fail_count, 's' if fail_count>1 else '')))

    if failed_modules:
        print "\n\nFailures\n" + "="*60
        for module, reason in failed_modules:
            print "'%s' failed: %s"%(module, reason)
    else:
        print "All tests passed."


