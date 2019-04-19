import pytest
import os
import re
import yaml
import time
from datetime import datetime

from selenium import webdriver

def log(*args):
    mesg = "\n(%s): %s " % (datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3], ' '.join(args))
    print(mesg)

def show_attrs(el, d):
    r"""
    print attributes of webdriver element to stdout
    for debugging
    """
    attrs = d.execute_script("var items = {}; for (index=0; index<arguments[0].attributes.length;++index) {items[arguments[0].attributes[index].name] = arguments[0].attributes[index].value }; return items;", el)
    print(attrs)

# allow converting from beautiful soup nodes back to selenium DOM elements
# https://stackoverflow.com/questions/37979644/parse-beautifulsoup-element-into-selenium
import itertools

def xpath_soup(element):
    """
    Generate xpath of soup element
    :param element: bs4 text or node
    :return: xpath as string
    """
    components = []
    child = element if element.name else element.parent
    for parent in child.parents:
        """
        @type parent: bs4.element.Tag
        """
        previous = itertools.islice(parent.children, 0, parent.contents.index(child))
        xpath_tag = child.name
        xpath_index = sum(1 for i in previous if i.name == xpath_tag) + 1
        components.append(xpath_tag if xpath_index == 1 else '%s[%d]' % (xpath_tag, xpath_index))
        child = parent
    components.reverse()
    return '/%s' % '/'.join(components)

###
# pass site file in on command line
###
def pytest_addoption(parser):
    parser.addoption(
        "--site", action="store", default="../cocalc.yaml", help="yaml file for test site"
    )
    parser.addoption(
        "--display", action="store", default="no", help="yes for browser window"
    )

@pytest.fixture(scope="session")
def site(request):
    r"""
    Return dict from yaml file name passed on command line.
    """
    fname = request.config.getoption("--site")
    with open(fname,"r") as infile:
        sdict = yaml.load(infile, Loader=yaml.BaseLoader)
    print(f"site name: {sdict['name']}")
    return sdict

@pytest.fixture(scope="session")
def display(request):
    r"""
    Return Boolean; False (default) for headless, True for showing browser
    """
    dispval = request.config.getoption("--display")
    return dispval in ["y","yes"]


###
# incremental testing
###
def pytest_runtest_makereport(item, call):
    if "incremental" in item.keywords:
        if call.excinfo is not None:
            parent = item.parent
            parent._previousfailed = item

def pytest_runtest_setup(item):
    if "incremental" in item.keywords:
        previousfailed = getattr(item.parent, "_previousfailed", None)
        if previousfailed is not None:
            pytest.xfail("previous test failed (%s)" % previousfailed.name)
###

@pytest.fixture(scope="session")
def driver(site, display):
    r"""
    start a selenium session with headless chrome
    """
    chrome_options = webdriver.ChromeOptions()
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--window-size=1420,1080')
    if not display:
        chrome_options.add_argument('--headless')
    chrome_options.add_argument('--disable-gpu')
    chrome_options.add_argument('--user-agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.121 Safari/537.36"')
    drvr = webdriver.Chrome(options=chrome_options)
    drvr.implicitly_wait(10)
    yield drvr

    drvr.close()

@pytest.fixture()
def test_id(request):
    r"""
    Return increasing sequence of integers starting at 1. This number is used as
    test id as well as message 'id' value so sage_server log can be matched
    with pytest output.
    """
    test_id.id += 1
    return test_id.id

test_id.id = 1

