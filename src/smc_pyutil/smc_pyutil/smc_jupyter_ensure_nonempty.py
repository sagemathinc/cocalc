#!/usr/bin/python

import json, os, sys

home = os.environ['HOME']


def process(paths):
    v = []
    for path in paths:
        if not path:
            continue
        path = os.path.abspath(path)
        if len(open(path).read().strip()) == 0:
            open(path, 'w').write("""{
 "cells": [
  {
   "cell_type": "code",
   "execution_count": null,
   "metadata": {
    "collapsed": true
   },
   "outputs": [],
   "source": []
  }
 ],
 "metadata": {
  "kernelspec": {
   "display_name": "Python 2 (SageMath)",
   "language": "python",
   "name": "python2"
  }
 },
 "nbformat": 4,
 "nbformat_minor": 2
}""")

def main():
    if len(sys.argv) == 1:
        print "Usage: %s [path names] ..."%sys.argv[0]
        print "Make sure if any file is empty it is replaced by a valid ipynb document."
    else:
        process(sys.argv[1:])

if __name__ == "__main__":
    main()
