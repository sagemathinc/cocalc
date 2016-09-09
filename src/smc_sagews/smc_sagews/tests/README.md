# Pytest suite for sage_server

## Purpose of These Tests

- verify that sage worksheets return correct results for given cell inputs
- back-end only test, uses message protocol to run tests against running sage_server
- NOT to provide unit tests of functions internal to sagews modules

## How to Use These Tests

### Prerequisites

- pytest must be installed
- sage_server must be running
- file ~/.smc/sage_server/sage_server.log must exist and have the
   current port number around line 3, like this:
   ```
   9240 (2016-09-07 04:03:39.455): Sage server 127.0.0.1:43359
   ```

### Running the Tests

```
cd smc/src/smc_sagews/smc_sagews
python -m pytest tests [-s]
```

Some tests require restarting the sage_server process. These would interfere with fixtures that do sage session setup once at the beginning of a test run and teardown at the end of the run. These tests are skipped by default. To run tests that would disrupt the default test session fixture, invoke tests with ONE of the following:
```
pytest -m no_session tests [-s]
python -m pytest -m no_session tests [-s]
```
