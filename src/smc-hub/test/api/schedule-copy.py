#!/usr/bin/env python3
"""
Useful for manually testing scheduled copying of files

To use this, create a file ~/test_api.yaml containing

```
key: "sk_x...."
src_project: "...uuid..."
target_project: "...uuid..."
path: "foo.md"
```
"""

import time
import requests
from requests.auth import HTTPBasicAuth
import json
import yaml
from pprint import pprint
import arrow
from os.path import expanduser
import yaml

CONFIG = yaml.safe_load(open(expanduser('~/test_api.yaml')))

def call_api(msg="",
             payload={},
             base_url="https://cocalc.com",
             timeout=4):
    r"""
    generic API call with retries

    msg - string message type: "create_account", "create_project", etc.
    payload - dict of parameters for the call

    return python dict of API response object
    """
    s = requests.Session()
    url = f"{base_url}/api/v1/{msg}"
    auth = HTTPBasicAuth(CONFIG['key'], '')
    headers = {'content-type': 'application/json'}
    r = s.post(url,
               auth=auth,
               data=json.dumps(payload),
               headers=headers,
               timeout=timeout)
    print(f"STATUS: {r.status_code}")
    try:
        return r.json()
    except:
        print("No data")


# jsonserialized timestamp, no timezone, a bit in the future...
future = arrow.now('UTC').shift(seconds=+30).for_json()
print(f"future = {future}")

task = {
    'src_project_id': CONFIG['src_project'],
    'target_project_id': CONFIG['target_project'],
    'src_path': CONFIG['path'],
    'scheduled': future
}

ret = call_api("copy_path_between_projects", task)
pprint(ret)

data = {'copy_path_id': ret['copy_path_id']}

while True:
    status = call_api("copy_path_status", data)
    pprint(status)
    if status['data'].get('finished'): break
    time.sleep(5)
