#!/usr/bin/env python
"""
Import all data from **all** json files in the given path:

  (1) converting them to csv files
  (2) processing timestamps nested in the csv files, if necessary
  (3) importing the csv files to temporary json tables
  (4) write the corresponding relational tables

"""

import os, sys

import json_to_csv, read_from_csv, populate_relational_table, export_from_rethinkdb

def process(table):
    # dump from rethinkdb as csv
    path_to_json = export_from_rethinkdb.process(table)
    # convert json to csv
    json_to_csv.process(path_to_json)
    # load csv into database
    read_from_csv.process("%s.csv"%os.path.splitext(path_to_json)[0])
    # process csv
    populate_relational_table.process(table)

if __name__ == "__main__":
    for file in sys.argv[1:]:
        process(file)