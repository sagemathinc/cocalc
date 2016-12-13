# Pytest suite for sage_server

## Goals

- verify that sage worksheets return correct results for given cell inputs
- back-end only test, uses message protocol to run tests against running sage_server

## Non-goals

- unit tests of functions internal to sagews modules
- UI testing

## How to Use These Tests

### Prerequisites

- pytest must be installed
- file ~/.smc/sage_server/sage_server.log must exist and have the
   current port number around line 3, like this:
   ```
   9240 (2016-09-07 04:03:39.455): Sage server 127.0.0.1:43359
   ```

### Running the Tests

```
cd smc/src/smc_sagews/smc_sagews/tests
rm failures
python -m pytest
cat failures
```

### Test Results

Names of failed tests are written to `failures` file. Example:
```
smc_sagews/tests/test_sagews_modes.py::TestScalaMode::()::test_scala_list
smc_sagews/tests/test_sagews_modes.py::TestScala211Mode::()::test_scala211_pat1
```


## Test Layout

These tests follow the 'inline' test layout documented at pytest docs [Choosing a test layout / import rules](http://doc.pytest.org/en/latest/goodpractices.html#choosing-a-test-layout-import-rules).

