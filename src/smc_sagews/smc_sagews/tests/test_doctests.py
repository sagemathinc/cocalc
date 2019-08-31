# run doctests for selected sagemath source files in sagews server
import socket
import conftest
import os
import re

from textwrap import dedent


import pytest
import future
import doctest

# doctests need sagemath env settings
# skip this entire module if not set
dtvar = 'SAGE_LOCAL'
if not dtvar in os.environ:
    pytest.skip("skipping doctests, {} not defined".format(dtvar), allow_module_level=True)


@pytest.mark.parametrize("src_file", [
    ('/ext/sage/sage/local/lib/python2.7/site-packages/sage/symbolic/units.py'),
    ('/ext/sage/sage/local/lib/python2.7/site-packages/sage/misc/flatten.py'),
    ('/ext/sage/sage/local/lib/python2.7/site-packages/sage/misc/banner.py')
])
class TestDT:
    def test_dt_file(self, test_id, sagews, src_file):
        print("src_file=", src_file)
        import sys

        from sage.doctest.sources import FileDocTestSource
        from sage.doctest.control import DocTestDefaults

        FDS = FileDocTestSource(src_file,DocTestDefaults())
        doctests, extras = FDS.create_doctests(globals())
        id = test_id
        excount = 0
        dtn = 0
        print("{} doctests".format(len(doctests)))
        for dt in doctests:
            print("doctest number", dtn)
            dtn += 1
            exs = dt.examples
            excount += len(exs)
            for ex in exs:
                c = ex.sage_source
                print("code", c)
                w = ex.want
                print("want", w)
                use_pattern = False
                # handle ellipsis in wanted output
                if '...' in w:
                    use_pattern = True
                    # special case for bad "want" value at end of banner()
                    wf = w.find('"help()" for help')
                    if wf > 0:
                        w = w[:wf]+'...'
                m = conftest.message.execute_code(code = c, id = id)
                sagews.send_json(m)

                if len(w) > 0:
                    typ, mesg = sagews.recv()
                    assert typ == 'json'
                    assert mesg['id'] == id
                    if 'stdout' in mesg:
                    #assert 'stdout' in mesg
                        output = mesg['stdout']
                        print("outp",output)
                    elif 'stderr' in mesg:
                        output = mesg['stderr']
                        # bypass err line number reporting in CoCalc
                        if w.startswith('Traceback'):
                            otf = output.find('Traceback')
                            if otf > 0:
                                output = output[otf:]
                        print("outp",output)
                    else:
                        assert 0
                    if use_pattern:
                        assert doctest._ellipsis_match(w ,output)
                    else:
                        assert output.strip() == w.strip()
                conftest.recv_til_done(sagews, id)
                id += 1
        print("{} examples".format(excount))
        conftest.test_id.id = id
