# front-end testing of CoCalc with puppeteer

## NOTE: This code is proof of concept, needs refactoring.

## Setup

1. Prepare test site. TODO: automate this.

    - create a test account in the instance to be tested
    - create a test project in the test user account
    - add test files to project home directory
      - latex-sample.tex
      - widget-sample.tex

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

1. Test project must be created before testing.
1. Test project must be in recent project list and running.

## TODO

1. Needs to be put in test framework (jest).
1. Should probably be in typescript.
1. Needs to be hosted & run regularly.
1. Fill out the test suite.