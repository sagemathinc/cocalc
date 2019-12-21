# Setup

## Install node modules

By default 110+ MB local Chromium is installed. Note that puppeteer's Chromium is typically at least 1 release ahead of CoCalc installed Chrome, `/usr/bin/chromium-browser`.

```
cd ~/cocalc/src/test/puppeteer
npm i -D
npm run build
```

If you don't want to install puppeteer's local chromium binary, you can do the following instead.
Then run tests with `-p` option.

```
cd ~/cocalc/src/test/puppeteer
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true npm i -D
npm run build
npm run test -- -c /path/to/creds.yaml -p
```


## Create test project

Install test files into home directory from [test_files folder](https://cocalc.com/projects/77a92d07-c122-4577-9c4c-c051379cacfe/files/CCTEST/TEST_FILES/?session=default)

```
texfile:  latex-sample.tex
widgetfile: widgets-sample.ipynb
sageipynbfile: sage-sample.ipynb
```

The following will install files named in `types.ts: TestFiles` from the `test_files` folder:
(terse):
```
 npm run install_files -- -c /path/to/creds.yaml
```
(verbose)
```
 npm run install_files_dbg -- -c /path/to/creds.yaml
```

## Credentials

Create credentials yaml file for the project:

<pre>
sitename: test_site
url: https://test47.cocalc.com/app
email: bob@example.com
passw: xxxxxx
project:  my-test-project
</pre>

Use special URL with http, project UUID, and project port for cc-in-cc:
<pre>
url: 'http://localhost:12345/8a3d0.../port/12345/app/',
</pre>

## Running tests

By default, use the puppeteer built-in Chrome browser.

With verbose output:
```
npm run tdbg -- -c /path/to/creds.yaml
```

Without verbose output:
```
npm run test -- -c /path/to/creds.yaml
```

Use CoCalc pre-installed Chrome at `/usr/bin/chromium-browser`:
```
npm run test -- -c /path/to/creds.yaml -p
```

Use Chrome at custom path:
```
npm run test -- -c /path/to/creds.yaml -p /custom/chrome
```

With GUI browser:
```
# run in .x11 terminal
npm run test -- -c /path/to/creds.yaml -H
```

To skip tests (and their subtests) that match a pattern:
```
npm run test -- -c /path/to/creds.yaml -k 'login'
```

### Sample run that creates account, project, and test files

Sample credentials in yaml file. Omit account creation token line if none is set for the instance under test.
```
sitename: cc-in-cc-myproj
url: http://localhost:34425/77a92d07-c122-4577-9c4c-c051379cacfe/port/34425/app/
email: joe@example.com
passw: asdfg
project: testproj
token: soylentgreen
firstname: Joe
lastname: Jones
```

Commands
```
# create test account
npm run create_account_dbg -- -c ~/CCTEST/staging-dev-cr.yaml -s -p
# create test project and upload test files
npm run install_files_dbg -- -c ~/CCTEST/staging-dev-cr.yaml -j -i test_files/ -p
# run GUI and API tests
npm run tdbg -- -c ~/CCTEST/staging-dev-cr.yaml -p
# delete test project just created
npm run tdbg -- -c ~/CCTEST/staging-dev-cr.yaml -p -x delete -s
```

## eslint

Just starting with this. Here's an example running eslint with `test_driver.ts`.

```
npm run eslint -- src/test_driver.ts
```

