#!/usr/bin/python
# -*- coding: utf-8 -*-

import os, sys

def prepare_file_for_open():
    # Before opening a file, we run this to make sure there is a blank JSON template in place.
    # This is for compatibility with "new jupyter".
    # See https://github.com/sagemathinc/cocalc/issues/1978
    # This may need to be updated periodically, and not doing so can cause
    # difficult-to-debug problems.  It would be much better if
    # Jupyter could handle a blank file... see
    #   https://github.com/sagemathinc/cocalc/issues/4645
    for path in sys.argv[1:]:
        if not os.path.exists(path) or len(open(path).read().strip()) == 0:
            open(path, 'w').write(
                '{"cells":[{"cell_type":"code","execution_count":null,"metadata":{},"outputs":[],"source":[]}],"metadata":{"kernelspec":{"display_name":"Python 3 (system-wide)","language":"python","name":"python3"},"language_info":{"codemirror_mode":{"name":"ipython","version":3},"file_extension":".py","mimetype":"text/x-python","name":"python","nbconvert_exporter":"python","pygments_lexer":"ipython3","version":"3.6.9"}},"nbformat":4,"nbformat_minor":4}'
            )
