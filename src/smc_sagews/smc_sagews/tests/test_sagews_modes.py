# test_sagews_modes.py
# tests of sage worksheet modes
import pytest
import conftest

class TestShMode:
    # start the jupyter bash kernel
    # do this as separate step to avoid following tests failing due to
    # issue890 traitlets deprecation warning
    def test_start_sh(self, exec2):
        exec2("%sh")

    # examples from sh mode docstring in sage_salvus.py
    # note jupyter kernel text ouput is displayed as html
    def test_single_line(self, exec2):
        exec2("%sh pwd\n", html_pattern=">/")

    def test_multiline(self, exec2):
        exec2("%sh\nFOO=hello\necho $FOO", html_pattern="hello")

    def test_direct_call(self, exec2):
        exec2("sh('date +%Y-%m-%d')", html_pattern = '\d{4}-\d{2}-\d{2}')

    def test_capture_sh_01(self, exec2):
        exec2("%capture(stdout='output')\n%sh uptime")
    def test_capture_sh_02(self, exec2):
        exec2("output", pattern="up.*user.*load average")

    def test_remember_settings_01(self, exec2):
        exec2("%sh FOO='testing123'", html_pattern="monospace")

    def test_remember_settings_02(self, exec2):
        exec2("%sh echo $FOO", html_pattern="testing123")

    def test_sh_display(self, execblob, image_file):
        execblob("%sh display < " + str(image_file))
# {u\'preparse\': True, u\'line\': u\'echo $VAR\', u\'top\': u"# autocomplete - don\'t run this cell, put cursor after VAR and hit [TAB]", u\'event\': u\'introspect\', u\'id\': u\'b4542e8b-9f5d-4736-87f6-af37f16d443a\'}
# {"id": "b4542e8b-9f5d-4736-87f6-af37f16d443a", "event": "introspect_completions", "completions": ["1","2"], "target": "$VAR"}
    def test_sh_autocomplete_01(self, exec2):
        exec2("%sh TESTVAR29=xyz")
    def test_sh_autocomplete_02(self, test_id, sagews):
        m = conftest.message.introspect(test_id, line='echo $TESTV', top='%sh')
        m['preparse'] = True
        sagews.send_json(m)
        typ, mesg = sagews.recv()
        assert typ == 'json'
        assert mesg['id'] == test_id
        assert mesg['event'] == "introspect_completions"
        assert mesg['completions'] == ["AR29"]
        assert mesg['target'] == "$TESTV"
