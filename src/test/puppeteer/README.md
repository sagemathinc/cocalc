# Setup

## Install node modules

By default 100+ MB local Chrome (v78 at present) is installed.

```
cd ~/cocalc/src/test/puppeteer
npm i -D
npm run build
```

## Create test project

Install test files into home directory from [TEST_FILES folder](https://cocalc.com/projects/77a92d07-c122-4577-9c4c-c051379cacfe/files/CCTEST/TEST_FILES/?session=default)

## Credentials

Create credentials yaml file for the project:

<pre>
sitename: test_site
url: https://test47.cocalc.com/app
email: bob@example.com
passw: xxxxxx
project:  my-test-project
texfile:  latex-sample.tex
widgetfile: widgets-sample.ipynb
sageipynbfile: sage-sample.ipynb
sagewsfile: sagews-sample.sagews
apikey: sk_xxxx...
</pre>

Use special URL with http, project UUID, and project port for cc-in-cc:
<pre>
url: 'http://localhost:12345/8a3d0.../port/12345/app/',
</pre>

## Running tests

By default, use the puppeteer built-in Chrome browser.

With verbose output:
```
npm run tdbg -- -c ~/path/to/creds.yaml
```

Without verbose output:
```
npm run test -- -c ~/path/to/creds.yaml
```

Use CoCalc pre-installed Chrome at `/usr/bin/chromium-browser`:
```
npm run test -- -c ~/path/to/creds.yaml -p
```

Use Chrome at custom path:
```
npm run test -- -c ~/path/to/creds.yaml -p /custom/chrome
```

With GUI browser:
```
# run in .x11 terminal
npm run test -- -c ~/path/to/creds.yaml -H
```
