#!/usr/bin/env python

import os
from doctest import testmod, NORMALIZE_WHITESPACE, ELLIPSIS

import backend, client, frontend, misc, model, session

def tm(module):
    testmod(module, optionflags=NORMALIZE_WHITESPACE | ELLIPSIS)

def run_doctests():
    tm(backend)
    tm(client)
    tm(frontend)
    tm(misc)
    tm(model)
    tm(session)

if __name__ == '__main__':
    run_doctests()
