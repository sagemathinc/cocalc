# front-end testing of CoCalc with puppeteer

## refactor 2019-07-30

different kinds of tests:

- can use a common login session
  - most cocalc single-user functionality

- unusual login session
  - get api key
  - create account
  - forgot password

- don't need puppeteer's browser but need credentials
  - api calls

- require more than one login
  - instructor/student
  - collaboration

- don't need browser or login
  - share server
  - published files
  - docs

- have email step
  - account email verification (if this is added)
  - invite to course
  - invite to project

Main test driver
- get config file info
- start global timing
- call common login session tests
  - call login
  - call some tests
  - call some more tests
- call get api key test




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

1. CoCalc instance undergoing test must be fully started.
1. Test project must be created before testing.
1. Test files must be in place:
    - latex-sample.tex
    - widget-sample.ipynb
1. Test project must be in recent project list and running.
1. Does not work with CoCalc-in-CoCalc instances.

## TODO

1. Put in jest framework.
1. Be more forgiving of projects that are not started.
1. Code in typescript.
1. Needs to be hosted & run regularly.
1. Expand the test suite.

## Goals

Most important at the top.

1. Finds bugs.

    - [7] See Coverage section below. Score is number of tests for key items.

1. Easy to update, so we can build a regression suite.

    - [ ] add a feature test in less than half an hour

1. Find spikes in latency.

    - [ ] Stores typical times for test steps and compares

1. Runs quickly.

    - [x] basic test in under 3 minutes
    - [ ] full test in under 15 minutes (sagews pytest is just over 6 minutes)

1. Readable results.

    - [ ] concise
    - [ ] reports failures including what fails & how
    - [ ] show results in real time (jest buffers report until all tests in a file are run)

1. Easy to setup.

    - [ ] one command to setup test account/project/files

1. Clean. Does not leave junk around after test run. That includes:
    - accounts
    - projects
    - files
    - [x] clean so far because test runs don't create anything

## Coverage

"x" indicates the test exists now

Deferred until discussion with team about how to clean up after test:
- create account
- create project
- create test files

Deferred until discuss how to test credit card transactions
- enter test credit card 2223003122003222 880
- add standard subscription

### basic tests for quick run

- [x] login with email address & password
- [x] open test project
- [x] tex file
- [x] get word count of .tex file
- [x] change intSlider widget in python 3 ipynb
- [x] simple calculation in sagemath ipynb
- [x] get_api_key

### account access

- [ ] add account-level ssh pub key
- [ ] forgot password, check email is received
- [ ] create temp auth key


### project setup
- [ ] adjust quotas: internet, member, 2hr idle time
- [ ] adjust quotas: 1000 MB disk, 1000 MB shared RAM
- [ ] new quotas show up correctly in Account / Upgrades: summary
- [ ] new quotas show up correctly in Account / Upgrades: applied upgrades
- [ ] remove all upgrades Account / Upgrades updates correctly
- [ ] remove all upgrades project Settings updates correctly
- [ ] banner for un-upgraded project is no longer huge and red
- [ ] Add collaborator who has account from Projects list
- [ ] Email invitation to collaborator who has account
- [ ] Add collaborator who doesn't have account, email blocked if project is not upgraded, warning message appears
- [ ] Add collaborator who doesn't have account, UI says invitation email is sent, invitation received
- [ ] ssh into project using public key added for account
- [ ] upload file through the (+)New UI

### sagews - upload (unless otherwise noted) and run

- [ ] upload pytest suite and run it

### ipynb
- [ ] ir kernel `library(datasets);str(iris)`
- [ ] ir-sage kernel `library(datasets);str(mtcars)`
- [ ] TESTING/jncf18_scalar.ipynb
- [ ] TESTING/jncf18_vector.ipynb cells that call threejs viewer appear empty when you click blue button to view contents. These are the cells just below "As other manifold objects..." and "Thanks to the embedding..."
- [ ] Public/r-hurricane-tracker.ipynb

### sharing

- [ ] share unlisted ir-sage ipynb file to test.cocalc.com/share: can view, not listed in share contents
- [ ] stop sharing: can no longer view
- [ ] share listed ir-sage ipynb file to test.cocalc.com/share: can view, is listed in share contents

### courses (TBD)

### API (TBD)
