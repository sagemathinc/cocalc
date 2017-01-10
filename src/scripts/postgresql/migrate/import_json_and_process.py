#!/usr/bin/env python
"""
Import all data from **all** json files in the given path:

  (1) converting them to csv files
  (2) processing timestamps nested in the csv files, if necessary
  (3) importing the csv files to temporary json tables
  (4) insert/update the corresponding relational tables

"""

import json_to_csv

import read_from_csv

def process(path_to_json):
    json_to_csv.process(path_to_json)
    base, ext = os.path.splitext(path_to_json)
    read_from_csv.process("%s.csv"%(x, base))

