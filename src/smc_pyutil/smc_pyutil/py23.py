# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – read LICENSE.md for details

# thin compatibility layer to support python 2 and 3
# to avoid an additional dependency on six & others

from __future__ import absolute_import, print_function
import sys

PY2 = sys.version_info[0] == 2
PY3 = sys.version_info[0] == 3

if PY3:
    string_types = str,
    text_type = str
    binary_type = bytes

    def iteritems(d, **kw):
        return iter(d.items(**kw))

    from urllib.parse import unquote, quote
    from html.parser import HTMLParser
    import pickle as cPickle

else:
    string_types = basestring,
    text_type = unicode
    binary_type = str

    def iteritems(d, **kw):
        return d.iteritems(**kw)

    from urllib import unquote, quote
    from HTMLParser import HTMLParser
    import cPickle


def py2decodestr(s):
    if PY3:
        return s
    else:
        return s.decode('utf8')

def py2encodestr(s):
    if PY3:
        return s
    else:
        return s.encode('utf8')
