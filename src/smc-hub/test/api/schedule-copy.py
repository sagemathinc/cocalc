#!/usr/bin/env python3
"""
Useful for manually testing scheduled copying of files
"""

import time
import requests
from requests.auth import HTTPBasicAuth
import json
import yaml
from pprint import pprint
import arrow
from os.path import expanduser

KEY = open(expanduser('~/test_api')).read().splitlines()[0]


def call_api(msg="",
             payload={},
             sk=KEY,
             base_url="https://test.cocalc.com",
             max_retries=3,
             timeout=4):
    r"""
    generic API call with retries

    msg - string message type: "create_account", "create_project", etc.
    payload - dict of parameters for the call
    sk - string, security key
    retries - int, number of retries on post

    return python dict of API response object
    """
    s = requests.Session()
    url = f"{base_url}/api/v1/{msg}"
    auth = HTTPBasicAuth(sk, '')
    headers = {'content-type': 'application/json'}
    r = s.post(url,
               auth=auth,
               data=json.dumps(payload),
               headers=headers,
               timeout=timeout)
    print(f"STATUS: {r.status_code}")
    return r.json()


# jsonserialized timestamp, no timezone, a bit in the future...
future = arrow.now('UTC').shift(seconds=+14).for_json()
print(f"future = {future}")

task = {
    'src_project_id': 'c37fbd83-c4c3-4f92-b66c-37b8d2c8cdf1',
    'target_project_id': '9282d61d-8d27-4b9f-ae0f-2fc9bac64203',
    'src_path': 'x.md',
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
