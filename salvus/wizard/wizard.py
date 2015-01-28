#!/usr/bin/env python
# coding: utf8

#####################################################################################
#                 SMC Wizard - Documentation Files Compiler                         #
#                                                                                   #
#                 Copyright (C) 2015, SageMathCloud Authors                         #
#                                                                                   #
#  Distributed under the terms of the GNU General Public License (GPL), version 2+  #
#                                                                                   #
#                        http://www.gnu.org/licenses/                               #
#####################################################################################

import sys
from os.path import abspath, normpath, exists, join
from os import makedirs, walk
from shutil import rmtree
import yaml
import json
import re
from codecs import open
from collections import defaultdict

""" # TODO enable hashtags later
hashtag_re = re.compile(r'#([a-zA-Z].+?\b)')
def process_hashtags(match):
    ht = match.group(1)
    return "<a class='smc-wizard-hashtag' href='{0}'>#{0}</a>".format(ht)
"""

def process_category(doc):
    cat = doc["category"]
    if isinstance(cat, (list, tuple)):
        assert len(cat) == 2
    elif isinstance(cat, basestring):
        cat = cat.split("/", 1)
    else:
        raise Exception("What is id '%s' supposed to be?" % cat)
    return [c.strip().title() for c in cat]

def process_doc(doc, input_fn):
    """
    This processes one document entry and returns the suitable datastructure for later conversion to JSON
    """
    if not all(_ in doc.keys() for _ in ["title", "code", "descr"]):
        raise Exception("keyword missing in %s in %s" % (doc, input_fn))
    title       = doc["title"].title()
    code        = doc["code"]
    description = doc["descr"] # hashtag_re.sub(process_hashtags, doc["descr"])
    return title, [code, description]

def wizard_data(input_dir, output_fn):
    input_dir = abspath(normpath(input_dir))
    wizard_js = abspath(normpath(output_fn))
    #print(input_dir, output_dir)

    #print(data)

    # this implicitly defines all known languages
    recursive_dict = lambda : defaultdict(recursive_dict)
    wizard = {
                 "sage":   recursive_dict(),
                 "python": recursive_dict(),
                 "r":      recursive_dict(),
                 "cython": recursive_dict(),
                 "gap":    recursive_dict()
              }

    for root, _, files in walk(input_dir):
        for fn in filter(lambda _ : _.lower().endswith("yaml"), files):
            input_fn = join(root, fn)
            data = yaml.load_all(open(input_fn, "r", "utf8").read())

            header   = data.next()
            language = header["language"]
            lvl1, lvl2 = process_category(header)
            if language not in wizard.keys():
                raise Exception("Language %s not known. Fix first document in %s.yaml" % (language, input_fn))

            for doc in data:
                if doc is None:
                    continue
                if "category" in doc:
                    lvl1, lvl2 = process_category(doc)
                else:
                    title, entry = process_doc(doc, input_fn)
                    grp = wizard[language][lvl1][lvl2]
                    if title in grp:
                        raise Exception("Duplicate title '{title}' in {language}::{lvl1}/{lvl2} of {input_fn}".format(**locals()))
                    grp[title] = entry

    with open(wizard_js, "w", "utf8") as f_out:
        # sorted keys to de-randomize output (to keep it in Git)
        json.dump(wizard, f_out, ensure_ascii=True, sort_keys=True)
    #return json.dumps(wizard, indent=1)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: %s <input-directory of *.yaml files> <ouput-file (usually 'wizard.js')>" % sys.argv[0])
        sys.exit(1)
    wizard_data(sys.argv[1], sys.argv[2])
