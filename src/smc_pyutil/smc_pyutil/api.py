# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – read LICENSE.md for details

# This code will work in both Python 2 and Python 3 to get
# the history of edits of a file in a project, using the
# project HTTP API.

from __future__ import absolute_import


def get_syncdoc_history(path, patches=False):
    """
    Get the history of all edits to the given file.  The path
    to the file must be relative to the HOME directory of the
    project, e.g., for the file $HOME/foo/a.md, set path to
    "foo/a.md".

    If patches is False (the default), only the lengths of patches
    are included in the history.  If patches is True, the actual
    patches themselves are included.
    """
    import json, os, requests
    if 'COCALC_SECRET_TOKEN' in os.environ:
        secret_token_file = os.environ['COCALC_SECRET_TOKEN']
    else:
        # fallback for cc-in-cc dev and cocalc-docker:
        secret_token_file = os.path.join(os.environ['SMC'], 'secret_token')
    secret_token = open(secret_token_file).read().strip()
    port_file = os.path.join(os.environ['SMC'], "local_hub/api_server.port")
    if not os.path.exists(port_file):
        raise RuntimeError("restart your project to start the api server")
    port = open(port_file).read().strip()
    data = {"path": path}
    if patches:
        data['patches'] = True
    x = json.loads(
        requests.post('http://localhost:%s/api/v1/get_syncdoc_history' % port,
                      auth=(secret_token, ''),
                      data=data).text)
    if 'error' in x:
        raise RuntimeError(x['error'])
    else:
        return x['history']
