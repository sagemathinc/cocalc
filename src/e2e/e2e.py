#!/usr/bin/env python3
# -*- coding: utf8 -*-
##############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, SageMath, Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################
# This is a py.test based test-runner for end2end testing SMC
# you can also run it via ipython3 -i in an interactive mode
###############################################################################

import time
import sys
import os
import logging

from selenium import webdriver
from selenium.webdriver.common.by import By
# wait and expected conditions:
# http://selenium-python.readthedocs.io/waits.html
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import UnexpectedAlertPresentException


class SMCLoggingContext(logging.Filter):
    '''
    Setup logging (timing info, etc.)
    '''

    def __init__(self):
        logging.Filter.__init__(self)
        self._start = time.time()
        self._last = self._start

    def filter(self, record):
        now = time.time()
        record.runtime = now - self._start
        record.elapsed = now - self._last
        self._last = now
        record.where = "%s:%s" % (record.filename[:-3], record.lineno)
        return True


def create_logger():
    fmt_str = '%(runtime)7.1f [%(elapsed)5.2f] %(where)-10s %(message)s'
    fmt = logging.Formatter(fmt=fmt_str)
    sh = logging.StreamHandler()
    sh.setFormatter(fmt)
    sh.setLevel(logging.DEBUG)
    log = logging.getLogger('e2e')
    log.setLevel(logging.DEBUG)
    log.addFilter(SMCLoggingContext())
    log.addHandler(sh)
    log.debug('logger setup completed')
    return log

log = create_logger()


class E2E:
    '''
    SMC end-to-end testing
    '''

    def __init__(self, base_url, email, pw, test_email, test_pw, timeout=10, interactive=False):
        self.timeout = timeout
        self.initial_setup(base_url, email, pw) # sets self.driver, etc.
        self.start(test_email, test_pw)
        self.testing()
        if interactive:  # stop before further tests happen
            self.log("Interactive mode started -- global variables are 'driver' and 'e2e'")
            return

    def testing(self):
        self.log('testing starts ...')
        self.open_project('test')
        self.open_file('test.sagews')

    def open_file(self, filename):
        '''
        assumes, we've opened a project
        '''        
        # filename input box
        filename_input = self.driver.find_element_by_xpath("//input[@data-test='project_files_filename']")
        filename_input.clear()
        filename_input.send_keys(filename)
        create_button = self.driver.find_element_by_xpath("//button[@data-test='project_files_create']")
        create_button.click()

    def open_project(self, name):
        '''
        clicks on the appropriate link in the list of projects to open a project
        '''
        driver = self.driver
        # step 1: click on the project overview button
        projects = driver.find_element_by_xpath("//a[@data-test='projects']")
        projects.click()
        # step 2: find a project named 'name' and click on it
        # <Well data-test="project-#{name}"
        project = driver.find_element_by_xpath("//div[@data-test='project-%s']" % name)
        project.click()
        # step 3: open the files tab -- first, get all the project navs 'a' tags
        file_tabs = driver.find_elements_by_xpath("//ul[@data-test='project-file-tabs']//a")
        # assert that nav tab 0 is "files"
        assert file_tabs[0].text == 'Files'
        file_tabs[0].click()

    def get_connection_status(self):
        '''
        This reads the connection status from the data-test and data-val attributes
        of the connection box.
        '''
        conn = self.driver.find_element_by_xpath(
            "//div[@data-test='connection-status']")
        status = conn.get_attribute('data-val').strip()
        self.log("connection status: '%s'" % status)
        return status

    def wait_until_connected(self):
        '''
        If not connected, we have a problem. wait a bit and try again ...
        '''
        while self.get_connection_status() != 'connected':
            self.log('not connected -- retrying')
            time.sleep(.5)
        return

    def debug(self, msg):
        log.debug(msg)

    log = debug

    def wait(self, cond, timeout=None):
        '''
        http://selenium-python.readthedocs.io/waits.html
        '''
        wait = WebDriverWait(driver, timeout or self.timeout)
        return wait.until(cond)

    def initial_setup(self, base_url, email, pw):
        '''
        This is the very first step for testing.
        It logs you in with **your** credentials, such that your cookie is set.
        Otherwise, you cannot access your smc-in-smc dev project!
        '''
        self.base_url = base_url
        self.smc_url = 'https://cloud.sagemath.com/'

        log.debug("setup started")
        # Optional argument, if not specified will search path -- actually, it doesn't
        # TODO use the configuration file and the args parser to change it.
        driver = webdriver.Chrome('/usr/lib/chromium-browser/chromedriver')
        self.driver = driver
        import atexit
        atexit.register(driver.quit)
        
        # when requesting an element and it isn't there, it retries automatically
        driver.implicitly_wait(self.timeout)
        
        # loading main site
        driver.get(self.smc_url)

        # initial sign in, this is brittle since we do not assume that there are data-test attributes
        xform = "//div[@class='smc-sign-in-form']//form[1]"
        form = driver.find_element_by_xpath(xform)
        email_input, pw_input = form.find_elements_by_tag_name('input')
        email_input.clear()
        email_input.send_keys(email)
        pw_input.clear()
        pw_input.send_keys(pw)
        # can't use self.wait_until_connected here, since it is the main site!
        time.sleep(2)
        form.submit()
        time.sleep(2)
        self.log("setup done")

    def start(self, test_email, test_pw):
        '''
        This is phase two.
        It switches to your smc-in-smc dev project and signs in with the test account.
        '''
        self.debug("start started")
        driver = self.driver
        driver.get(self.base_url)

        # now we are able to use the data-test attributes
        xform = "//form[@data-test='signin1']"

        # sign in -- check if there is this alert about moving away from the site!
        try:
            signin = self.driver.find_element_by_xpath(xform)
        except UnexpectedAlertPresentException as uape:
            self.log("there was an alert box -- I accepted it")
            alert = driver.switch_to_alert()
            alert.accept()
            signin = self.driver.find_element_by_xpath(xform)

        email, password = signin.find_elements_by_tag_name("input")
        email.send_keys(test_email)
        password.send_keys(test_pw)
        # make sure we're connected before submitting the form
        self.wait_until_connected()
        signin.submit()


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", help="credentials file", default="e2e.ini")
    parser.add_argument("--password", help="account password", default=None)
    parser.add_argument("--base_url", help="URL where to test", default=None)
    args = parser.parse_args()

    import configparser
    config = configparser.ConfigParser()
    config.read(args.config)

    email = config['account']['email']
    pw = args.password or config['account'].get('password', None)
    if pw is None:
        from getpass import getpass
        pw = getpass("Your SMC Account Password: ")

    test_email = config['test']['email']
    test_pw = config['test']['password']

    base_url = args.base_url or config['setup'].get(
        'base_url', "https://cloud.sagemath.com/")

    # TODO config['setup']['timeout'] → timeout

    import sys
    try:
        if sys.ps1:
            interactive = True
    except AttributeError:
        interactive = False
        if sys.flags.interactive:
            interactive = True

    log.debug('interactive mode: %s' % interactive)
    e2e = E2E(base_url, email, pw, test_email,
              test_pw, interactive=interactive)
    if interactive:
        globals()['e2e'] = e2e
        globals()['driver'] = e2e.driver
