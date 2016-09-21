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

    # need exec finalizer after each cell for capture
    # that is why two tests
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