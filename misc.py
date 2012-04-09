"""
Miscellaneous functions.
"""

import urllib, urllib2

def post(url, data, read=False, timeout=10):
    """
    POST the dictionary of data to the url.  If read=True return the
    response from the server.
    """
    r = urllib2.urlopen(urllib2.Request(url, urllib.urlencode(data)), timeout=timeout)
    if read:
        return r.read()

def get(url, data=None, timeout=10):
    """
    ...
    """
    if data is not None:
        url += '?' + urllib.urlencode(data)
    return urllib2.urlopen(url, timeout=timeout).read()

