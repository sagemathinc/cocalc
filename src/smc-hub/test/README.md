# Running mocha tests in smc-hub:

DEPRECATED

## 1. Development install

Running mocha tests requires development install.

## 2. Start test db instance

Use separate .term session to start postgresql in the foreground. This command also creates the file `postgres-env` used in next step:

```
~/cocalc/src/dev/project/start_postgres.py
```

## 3. Run the tests

The api tests generate a lot of debug output, which can be filtered out as shown. Also shown is overriding the `progress` reporter.

```
cd ~/cocalc/src
. smc-env
. dev/project/postgres-env
cd smc-hub
REPORTER=spec BAIL=-b npm run testapi 2>&1 | egrep -v "(debug|deprec|  at )"
```

