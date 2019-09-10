# front-end testing of CoCalc with puppeteer, js version

## Status 2019-09-09

**This is the last commit for the js version.** Ongoing work will be with typescript.

Typical test run. Can be used with cc-in-cc as well as independent instances cocalc.com, test.cocalc.com, and Docker images.

```
### start cc-in-cc instance in this project
cd ~/cocalc/src/test/puppeteer
node index.js -c ~/CCTEST/creds-staging-dev.js
node widget.js -c ~/CCTEST/creds-staging-dev.js
node api_key.js -c ~/CCTEST/creds-staging-dev.js
```

Tests for `login.js` and `widget.js` may need to be run 2-3 times to get success.


## Setup

1. Prepare test site. TODO: automate this.

    - create a test account in the instance to be tested
    - create a test project in the test user account
    - add test files to project home directory
      - latex-sample.tex (for test file [index.js](index.js))
      - widget-sample.tex (for test file [widget.js](widget.js))

1. Create `<creds-file.js`file for the site to be tested, outside of the git repository. Do NOT add/commit credentials files to git.

    Example credentials file "creds.js":

    ```
    module.exports = {
        url: 'https://cocalcinstance.com/app',
        username: 'testuser@example.com',
        password: 'asdf8qwerty',
        project:  'fe-test',
        texfile:  'latex-sample.tex'
    }
    ```

## Running the tests

1. Default operation is headless.
To view the browser during testing, run the script from a .x11 terminal and add `-s` or `--screen` to command line options. Omit `.js` suffix from credentials file on the command line, e.g. if the file is ~/creds.js, use `node -c ~/creds`.``

    ```
    cd ~/cocalc/src/test/puppeteer

    node index.js [-s] [-c credentials-file]
      -s - display the browser window (opposite of headless), default false
      -c - name of credentials file, without ".js" extension
    ```

1. If the Cocalc instance was recently restarted or the test project is stopped, the first one or two runs of the test will timeout. (See TODO below.)

1. These tests have been tested with the latest regular and no-agpl Docker images as well as test and production cocalc.com.

## What is tested

### index.js

1. Get sign-in page.
1. Sign in with email and password.
1. Open test project.
1. Open tex file.
1. Get word count.

### api_key.js

1. Get get_api sign-in page.
1. Get api key.

### widget.js

1. Get sign-in page.
1. Sign in with email and password.
1. Open test project.
1. Open Jupyter notebook.
1. Run first cell.
1. Click on IntSlider() widget and verify change in readout.

## Limitations

1. Test project must be in recent project list and running.
1. Test files must be in place.

## TODO

1. ~~Put in jest framework.~~
1. Don't fail when testing projects that are not started.
1. Code in typescript.
1. Needs to be hosted & run regularly.
1. Expand the test suite.
