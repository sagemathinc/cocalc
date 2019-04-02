import conftest
import pytest
import time

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
        time.sleep(1)


    def test_searchproj(self, driver, site):
        r"""
        type in the name of the test project
        """
        els = driver.find_elements_by_tag_name("input")
        phtext = "Search for projects..."
        for x in els:
            #conftest.show_attrs(x, driver)
            if x.get_attribute("placeholder") == phtext:
                break
        else:
            assert 0, f'Placeholder "{phtext}" not found'
        
        project = site.get('project')
        x.send_keys(project)
        time.sleep(1)
        driver.save_screenshot('sfp.png')

    def test_projitem(self, driver, site):
        r"""
        Click on test project name.
        """
        project = site.get('project')
        x = driver.find_element_by_link_text(project)
        x.click()
        time.sleep(3)
        driver.save_screenshot('projitem.png')
