# Setup

## Install node modules

By default 100+ MB local Chrome (v78 at present) is installed.

```
cd ~/cocalc/src/test/puppeteer
npm i -D
npm run build
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



