#!/usr/bin/env python

import os, sys

from doctest import testmod, NORMALIZE_WHITESPACE, ELLIPSIS

# port that all modules assume the suprocess server is running on 
SUBPROCESS_PORT = 4999

def doctest_modules(modules, verbose=False):
    """
    INPUT:

    - ``modules`` -- a list of modules
    - ``verbose`` -- bool (default: False)
    
    EXAMPLES::

    Stupid test -- do nothing::
    
        >>> doctest_modules([])
    """
    for module in modules:
        print "testing: ", module.__name__
        testmod(module, optionflags=NORMALIZE_WHITESPACE | ELLIPSIS, verbose=verbose)

if __name__ == '__main__':
    #TODO proper option parsing
    
    import subprocess_server
    r = subprocess_server.Daemon(SUBPROCESS_PORT)

    # TODO: more powerful control, e.g., verbosity, etc. ; only certain modules
    if len(sys.argv) > 1 and sys.argv[1] == '-d':

        import backend, client, frontend, misc, model, session, subprocess_server
        modules = [backend, client, frontend, misc, model, session, subprocess_server]
        
        if len(sys.argv) > 2:
            mods = [x.rstrip('.py') for x in sys.argv[2:]]
            modules = [x for x in modules if x.__name__ in mods]
        doctest_modules(modules, verbose = '-v' in sys.argv)
    else:
        os.system('py.test %s'%(' '.join(sys.argv[1:])))
            

        
