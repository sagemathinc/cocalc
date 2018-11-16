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
python -m pytest
```

### Test Results

The test results will be stored in a machine-readable json file in `$HOME/sagews-test-report.json`:

```
cat ~/sagews-test-report.json
```

Example:

```
{
 "start": "2016-12-15 12:50:09.620189", 
 "version": 1,
 "end": "2016-12-15 12:53:00.064441", 
 "name": "smc_sagews.test", 
 "fields": [
  "name", 
  "outcome", 
  "duration"
 ], 
 "results": [
  [
   "basic_timing", 
   "passed", 
   1.0065569877624512
  ], 
  ...
  ]
 }
```

and `$HOME/sagews-test-report.prom` for ingestion by Prometheus' node exporter.

## Test Layout

These tests follow the 'inline' test layout documented at pytest docs [Choosing a test layout / import rules](http://doc.pytest.org/en/latest/goodpractices.html#choosing-a-test-layout-import-rules).

