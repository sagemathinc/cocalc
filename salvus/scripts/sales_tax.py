#!/usr/bin/env python

# Prints a CoffeeScript map from zip codes to tax rates based on
# https://s3-us-west-2.amazonaws.com/taxrates.csv/TAXRATES_ZIP5_WA201508.csv
# only for the State of Washington.
import urllib2
import csv

reader = csv.reader(urllib2.urlopen("https://s3-us-west-2.amazonaws.com/taxrates.csv/TAXRATES_ZIP5_WA201508.csv"))
v = []
for line in reader:
    zipcode = line[1]
    rate = line[4]
    v.append("%s:%s"%(zipcode, rate))
    
print("exports.WA_sales_tax = {%s}"%(', '.join(v[1:])))