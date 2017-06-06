# Unit test sagews without sage_server

## Goals

- test components of sage worksheets
- avoid overhead and extraneous issues raised when testing through sage_server

## How to Use These Tests

### Running the Tests

```
cd smc/src/smc_sagews/smc_sagews/test_without_server

# test all jupyter_client launch of all 15 non-sage kernels
python -m pytest

# test all jupyter_client launch of selected kernels
python -m pytest --kname=anaconda3,singular

# look for failed tests
grep fail ~/jclient-test-report.prom

# output:
# sagews_jclient_test{name="compute[apache_toree_scala]",outcome="failed"} 16.109400034 1496753157000
```

### Test Results

The test results will be stored in a machine-readable json file in `~/jclient-test-report.json`:

Example:

```
{
 "start": "2017-06-05 12:50:09.620189", 
 "version": 1,
 "end": "2017-06-05 12:53:00.064441", 
 "name": "smc_sagews_jclient.test", 
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

and `~/jclient-test-report.prom` for ingestion by Prometheus' node exporter.

