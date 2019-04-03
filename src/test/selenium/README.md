# front-end testing of CoCalc with pytest and selenium

## Setup

1. Checkout cocalc source and do

    ```
    cd cocalc/src/test/selenium
    ```

1. Prepare test site. TODO: automate this.

    - create a test account in the instance to be tested
    - create a test project in the test user account
    - add test files to project home directory


1. Create `<sitename>.yaml` file for the site to be tested. Place in directory above `tests` directory and do NOT add/commit to git. The `name` value can be any descriptive name. *Note: `*.yaml` is in .gitignore for this directory.*

    ```
    url: https://test.cocalc.com
    email: testuser@example.com
    passw: SoylentIsntGreen
    name: test.cocalc.com
    project: fe-test
    ```

## Running the tests

Default operation is headless. Add `--display=yes` to view selenium test browser window. If running from CoCalc with display enabled, use an X11 xterm.

```
cd ~/cc-test/tests
python3 -m pytest --site=../cocalc.yaml [--display=yes]
```

## What is tested

1. Get landing page.
1. Sign in with email and password.
1. Open test project.
1. Open sample files.

## Limitations and caveats

1. Test project must be created before testing.
1. Test project must be in recent history and running.
1. In some cases, test URL must be specified with IP address.
1. Password may be displayed during log & error output.
