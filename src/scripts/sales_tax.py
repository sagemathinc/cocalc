#!/usr/bin/env python

 # Prints a CoffeeScript map from zip codes to tax rates based on
 # http://dor.wa.gov/Content/FindTaxesAndRates/RetailSalesTax/DestinationBased/ClientInterface.aspx
 # only for the State of Washington.

import urllib2
import re
import csv

def parse_tax_rate(text):
    match = re.search("Rate=([0-][\.1][0-9]*)", text)
    if match is not None:
        return match.group(1)
    else:
        return None

def parse_result_code(text):
    match = re.search("ResultCode=([0-9])", text)
    if match is not None:
        return match.group(1)
    else:
        return None


def get_tax_rate_of_zip(zip_code):
    """
    This function returns the tax rate of a given zipcode (no +4 extension) in WA

    Uses the interface described here
    http://dor.wa.gov/Content/FindTaxesAndRates/RetailSalesTax/DestinationBased/ClientInterface.aspx

    A result code will be returned for both XML and text response formats.  The codes are defined as:

      0:  The address was found.
      1:  The address was not found, but the ZIP+4 was  located.
      2:  Neither the address or ZIP+4 was found, but  the 5-digit ZIP was located.
      3:  The address, ZIP+4, and ZIP could not be  found.
      4:  Invalid arguments.
      5:  Internal error.

    A tax rate of 9.7% is reported as a float .097
    """
    URL = "http://dor.wa.gov/AddressRates.aspx?output=text&addr=&city=&zip={}".format(zip_code)
    response = urllib2.urlopen(URL)
    text = response.read()
    # Example responses:
    # LocationCode=4000 Rate=0.086 ResultCode=2
    # LocationCode=-1 Rate=-1 ResultCode=3 debughint=
    tax_rate = parse_tax_rate(text)
    result_code = parse_result_code(text)

    if int(result_code) != 2:
        return None
    elif tax_rate < 0:
        raise ValueError("Result code was 0 but tax rate was negative for zip code {}".format(zip_code))
    else:
        return float(tax_rate)

with open('wa_zips.txt') as inputfile:
    results = list(csv.reader(inputfile))

taxes_per_zip = []
for item in results:
    zip_code = item[0]
    tax_rate = get_tax_rate_of_zip(zip_code)
    if tax_rate is not None:
        taxes_per_zip.append("{}:{:.6f}".format(zip_code, tax_rate))

print("exports.WA_sales_tax = {%s}"%(', '.join(taxes_per_zip[1:])))
