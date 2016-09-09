# test_sagews_modes.py
# tests of sage worksheet modes
import pytest
import conftest

class TestShMode:
    # examples from sh mode docstring in sage_salvus.py
    def test_single_line(self, exec2):
        exec2("%sh pwd\n", pattern="^/")
    def test_multiline(self, exec2):
        exec2("%sh\nFOO=hello\necho $FOO", "hello\n")
    def test_direct_call(self, exec2):
        exec2("sh('date +%Y-%m-%d')", pattern = '^\d{4}-\d{2}-\d{2}$')
    def test_capture_sh_01(self, exec2):
        exec2("%capture(stdout='output')\n%sh\nuptime")
    def test_capture_sh_02(self, exec2):
        exec2("output", pattern="up.*users.*load average")