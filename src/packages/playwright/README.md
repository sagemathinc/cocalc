# Playwright End-to-End Testing of CoCalc

This is just a small start.

## Configuration

Right now to test cocalc running at, e.g., `test.cocalc.com`, you have to create a file `auth/test.cocalc.com` that has three lines in it:

```
api_key
account_id
password
```

Then you set the environment variable SITE to test.cocalc.com (that's the default right now) and do

```sh
export SITE=test.cocalc.com
pnpm test
```

The reason the api_key is needed is because the only way for
a robot to sign into cocalc is via the api, since currently
we have a captcha for theme main sign in and sign up pages,
xhich prevents sign in.
