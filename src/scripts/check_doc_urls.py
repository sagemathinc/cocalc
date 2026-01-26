#!/usr/bin/env python
"""
Check that all links to the documentation are valid.
"""
import os
import re
import requests as r
import time
from multiprocessing.pool import ThreadPool

BASE_URL = "https://doc.cocalc.com"

# change the working directory to the parent directory, of there this file is
curdir = os.path.dirname(os.path.abspath(__file__))
parentdir = os.path.dirname(curdir)
os.chdir(parentdir)


def extract_urls(fn):
    with open(fn) as f:
        content = f.read()
        pattern = fr'''({BASE_URL}[^\s'"\\\n)]+)'''
        urls = re.findall(pattern, content)

        for url in urls:
            # remove anchors
            if '#' in url:
                url = url[:url.index('#')]
            # remove query parameters
            if '?' in url:
                url = url[:url.index('?')]
            yield url


def get_all_urls():
    """
    use git grep to find all files, that contain the BASE_URL
    and then extract all urls from those files
    """
    cmd = f"git grep -lI {BASE_URL}"
    output = os.popen(cmd).read()
    files = output.split()
    # combine all urls into one set
    all_url = set()
    for fn in files:
        for url in extract_urls(fn):
            all_url.add(url)
    return sorted(all_url)


def check_url(url):
    """
    Check the HTTP HEAD request for the given URL, to avoid
    downloading the whole file. Retry a few times for transient failures.
    """
    attempts = 3
    delay = 5
    for attempt in range(1, attempts + 1):
        try:
            res = r.head(url, timeout=10)
            res.raise_for_status()
        except Exception as ex:
            if attempt < attempts:
                time.sleep(delay)
                continue
            print(f"✗ {url}: {ex}")
            return False
        else:
            print(f"✓ {url}")
            return True


def main():
    """
    Check all URLs. We use HEAD requests, so that we don't download the whole file.
    """
    all_url = get_all_urls()
    print(f"Checking {len(all_url)} URLs...")
    results = ThreadPool(16).map(check_url, all_url)
    if not all(results):
        num_failed = len([x for x in results if not x])
        print(f"{num_failed} URLs failed.")
        exit(1)
    else:
        print("All URLs are valid.")


if __name__ == '__main__':
    main()
