import conftest
import pytest
import time
from selenium.webdriver.common.keys import Keys
from bs4 import BeautifulSoup

# suffix "xp" is for "xpath"

@pytest.mark.incremental
class TestStartCocalc:
    def test_landing(self, driver, site):
        r"""
        Load initial landing page and click "Sign In".
        """
        url = site['url']
        driver.get(url)
        driver.save_screenshot('landing.png')
        x = driver.find_element_by_class_name('get-started')
        assert x.text == 'Sign In'
        x.click()

    def test_signin(self, driver, site):
        r"""
        Enter email address and password and click "Sign In"
        """
        els = driver.find_elements_by_name("email")
        el = els[1]
        email = site['email']
        el.send_keys(email)

        els = driver.find_elements_by_name("password")
        el = els[1]
        password = site['passw']
        el.send_keys(password)

        # find parent div of signin button
        el0 = driver.find_element_by_class_name("col-xs-3")
        # find signin button
        el = el0.find_element_by_tag_name("button")
        # conftest.show_attrs(el, driver)

        el.submit()


    def test_searchproj(self, driver, site):
        r"""
        type in the name of the test project
        """
        # find this value empirically by loading page and counting inputs
        inputs_needed = 21
        ninputs = 0
        ntries = 0
        while ninputs < inputs_needed:
            els = driver.find_elements_by_tag_name("input")
            ntries += 1
            ninputs = len(els)
            if ntries > 5:
                break
        phtext = "Search for projects..."
        for x in els:
            #conftest.show_attrs(x, driver)
            if x.get_attribute("placeholder") == phtext:
                break
        else:
            assert 0, f'Placeholder "{phtext}" not found'

        project = site.get('project')
        x.send_keys(project)
        driver.save_screenshot('sfp.png')

    def test_projitem(self, driver, site):
        r"""
        Click on test project name.
        """
        project = site.get('project')
        x = driver.find_element_by_link_text(project)
        x.click()
        driver.save_screenshot('projitem.png')

    def test_select_tex_file(self, driver, site):
        r"""
        type in the name of the tex sample file
        """
        inputs_needed = 23
        ninputs = 0
        ntries = 0
        while ninputs < inputs_needed:
            els = driver.find_elements_by_tag_name("input")
            ntries += 1
            ninputs = len(els)
            if ntries > 5:
                break
        phtext = "Search or create file"
        print(f'**** {ninputs} inputs found after {ntries} tries')
        for x in els:
            #conftest.show_attrs(x, driver)
            if x.get_attribute("placeholder") == phtext:
                break
        else:
            assert 0, f'Placeholder "{phtext}" not found'

        texfile = site.get('texfile')
        print(f'type of RETURN is {type(Keys.RETURN)}')
        x.send_keys(texfile + Keys.RETURN)

    def test_open_tex_file(self, driver, site):
        r"""
        find the Build button and click it
        """
        ntries = 0
        sfa = None
        while not sfa:
            soup = BeautifulSoup(driver.page_source, 'html.parser')
            #sfa = soup.find('button', string='Build project')
            sfa = soup.find('span', string='Build')
            ntries += 1
            print(f'**** {ntries} tries')
            if ntries > 5:
                break
        print(sfa)
        xpath = conftest.xpath_soup(sfa)
        sfas = driver.find_element_by_xpath(xpath)
        sfas.click()
        driver.save_screenshot('tex.png')

