# End2End testing

## Setup

1. $ sudo apt-get install chromium-chromedriver -y
2. $ pip3 install selenium # it's all python 3
3. Compile SMC with the --debug flag (e.g. the watched webpack build for smc-in-smc)
4. In your smc-in-smc project, create an account for testing
5. Create `e2e.ini` file, containing setup and credentials of that test account
6. Run via `ipython3 -i e2e.py` to enter the interactive mode.

## e2e.ini

```
[setup]
timeout = 10
base_url = https://cloud.sagemath.com/14eed217-2d3c-4975-a381-b69edcb40e0e/port/56754/

[account]
# your account
email = xxx@yyy.zzz
password = password [optional, will ask you]

[test]
# the testing account in your smc-in-smc project
email = test@sagemath.com
password = only-for-testing
```

## Run

Call this file with the following arguments
 * --config e2e.ini -- optional, defaults to creds.ini credential file
 * --password -- optional, sets your account password, overwrites the one in e2e.ini
 * --base_url https://cloud.sagemath.com/14eed217-2d3c-4975-a381-b69edcb40e0e/port/56754/ -- optional
     base-URL where the SMC single-page app is located, defaults to https://cloud.sagemath.com/
 * if you do not specify your SMC account password anywhere, you'll be asked interactively!

## Doc

* http://selenium-python.readthedocs.io/locating-elements.html
