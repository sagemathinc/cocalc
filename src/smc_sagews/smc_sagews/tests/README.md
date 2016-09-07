# Pytest suite for sage_server

## Purpose of These Tests

- verify that sage worksheets return correct results for given cell inputs
- back-end only test, uses message protocol to run tests against running sage_server
- NOT to provide unit tests of functions internal to sagews modules

## How to Use These Tests

### Prerequisites

- pytest must be installed
- make sure ~/.smc/sage_server/sage_server.log exists and has the
   current port number around line 3, like this:
   ```
   9240 (2016-09-07 04:03:39.455): Sage server 127.0.0.1:43359
   ```

### Running the Tests

```
cd .../src/smc_sagews/smc_sagews
pytest tests [-s]
```