"""
Miscellaneous functions.
"""

import os

from StringIO import StringIO

import requests
ConnectionError = requests.ConnectionError

def get(url, data=None, timeout=1):
    """
    Get the url with optional parameters as specified by the data variable.
    EXAMPLES::
    """
    if data is None: data = {}
    return requests.get(url, params=data, timeout=timeout).text

def post(url, data=None, files=None, timeout=10):
    """
    POST the dictionary of data to the url, and return the response
    from the server.
    """
    if files is None:
        files = {}
    else:
        files = dict([(k,StringIO(v)) if isinstance(v, basestring) else (k,v)
                      for k,v in files.iteritems()])
    if data is None: data = {}
    return requests.post(url, data=data, timeout=timeout, files=files).text

def all_files(path):
    all = []
    n = len(path)
    for root, dirs, files in os.walk(path):
        for fname in files:
            all.append(os.path.join(root[n+1:], fname))
    return all
