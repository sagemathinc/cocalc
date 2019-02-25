def pytest_addoption(parser):
    """specify comma-delimited list of kernel names to limit test"""
    parser.addoption("--kname", action="store", help="kernel name")


def pytest_generate_tests(metafunc):
    """default is to test all non-sage kernels listed with `jupyter kernelspec list`"""
    option_value = metafunc.config.option.kname
    if 'kname' in metafunc.fixturenames and option_value is not None:
        knames = option_value.split(',')
        metafunc.parametrize("kname", knames)
    # nsk = list of available non-sage kernel names
    # skip first line of command output, "Available kernels"
    else:
        v = [
            x.strip() for x in os.popen("jupyter kernelspec list").readlines()
        ]
        nsk = [x.split()[0] for x in v[1:] if not x.startswith('sage')]
        metafunc.parametrize("kname", nsk)


#
# Write machine-readable report files into the $HOME directory
# http://doc.pytest.org/en/latest/example/simple.html#post-process-test-reports-failures
#
import os
import json
import pytest
import time
from datetime import datetime

report_json = os.path.expanduser('~/sagews-direct-test-report.json')
report_prom = os.path.expanduser('~/sagews-direct-test-report.prom')
results = []
start_time = None


@pytest.hookimpl
def pytest_configure(config):
    global start_time
    start_time = datetime.utcnow()


@pytest.hookimpl
def pytest_unconfigure(config):
    global start_time

    def append_file(f1, f2):
        with open(f1, 'a') as outf1:
            with open(f2, 'r') as inf2:
                outf1.write(inf2.read())

    data = {
        'name': 'sagews_direct.test',
        'version': 1,
        'start': str(start_time),
        'end': str(datetime.utcnow()),
        'fields': ['name', 'outcome', 'duration'],
        'results': results,
    }
    report_json_tmp = report_json + '~'
    with open(report_json, 'w') as out:
        json.dump(data, out, indent=1)
    # this is a plain text prometheus report
    # https://prometheus.io/docs/instrumenting/exposition_formats/#text-format-details
    # timestamp milliseconds since epoch
    ts = int(1000 * time.mktime(start_time.timetuple()))
    # first write to temp file ...
    report_prom_tmp = report_prom + '~'
    with open(report_prom_tmp, 'w') as prom:
        for (name, outcome, duration) in results:
            labels = 'name="{name}",outcome="{outcome}"'.format(**locals())
            line = 'sagews_direct_test{{{labels}}} {duration} {ts}'.format(
                **locals())
            prom.write(line + '\n')
    # ... then atomically overwrite the real one
    os.rename(report_prom_tmp, report_prom)


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    # execute all other hooks to obtain the report object
    outcome = yield
    rep = outcome.get_result()

    if rep.when != "call":
        return

    #import pdb; pdb.set_trace() # uncomment to inspect item and rep objects
    # the following `res` should match the `fields` above
    # parent: item.parent.name could be interesting, but just () for auto discovery
    name = item.name
    test_ = 'test_'
    if name.startswith(test_):
        name = name[len(test_):]
    res = [name, rep.outcome, rep.duration]
    results.append(res)
