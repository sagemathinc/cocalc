# Unit test sagews features directly

(without sage_server)

## Goals

- test components of sage worksheets
- avoid overhead and extraneous issues raised when testing through sage_server

## How to Use These Tests

### Running the Tests

```
cd cocalc/src/smc_sagews/smc_sagews/test_direct

# test jupyter_client launch of all non-sage kernels
python -m pytest

# test selected kernels
python -m pytest --kname=anaconda3,singular
```

### Test Results

Test results will be stored in machine-readable file `~/sagews-direct-test-report.json`:

Example:

```
{
 "start": "2017-06-06 14:40:43.066034",
 "end": "2017-06-06 14:41:29.976735",
 "version": 1,
 "name": "sagews_direct.test",
 "fields": [
  "name",
  "outcome",
  "duration"
 ],
 "results": [
  [
   "start_new_kernel[anaconda3]",
   "passed",
   2.9162349700927734
  ],
  ...
```

and `~/sagews-direct-test-report.prom` for ingestion by Prometheus' node exporter.

