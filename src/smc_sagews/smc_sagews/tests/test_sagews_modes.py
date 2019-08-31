# test_sagews_modes.py
# tests of sage worksheet modes
import pytest
import conftest
import re
import os
from textwrap import dedent


class TestLatexMode:
    def test_latex(self, execblob):
        execblob(
            "%latex\nhello",
            want_html=False,
            file_type='png',
            ignore_stdout=True)


class TestP3Mode:
    def test_p3a(self, exec2):
        exec2("p3 = jupyter('python3')")

    def test_p3b(self, exec2):
        exec2("%p3\nimport sys\nprint(sys.version)", pattern=r"^3\.[56]\.\d+ ")


class TestSingularMode:
    def test_singular_version(self, exec2):
        exec2('%singular_kernel\nsystem("version");', pattern=r"^41\d\d\b")

    def test_singular_factor_polynomial(self, exec2):
        code = dedent('''
        %singular_kernel
        ring R1 = 0,(x,y),dp;
        poly f = 9x16 - 18x13y2 - 9x12y3 + 9x10y4 - 18x11y2 + 36x8y4 + 18x7y5 - 18x5y6 + 9x6y4 - 18x3y6 - 9x2y7 + 9y8;
        factorize(f);''').strip()
        exec2(
            code,
            u'[1]:\n   _[1]=9\n   _[2]=x6-2x3y2-x2y3+y4\n   _[3]=-x5+y2\n[2]:\n   1,1,2\n'
        )


import platform

# this comparison doesn't work in sage env
# because the distro version is spoofed
# platform.linux_distribution()[1] == "18.04",

@pytest.mark.skipif(
    True,
    reason="scala jupyter kernel broken in 18.04")
class TestScalaMode:
    def test_scala_list(self, exec2):
        print("linux version {}".format(platform.linux_distribution()[1]))
        exec2(
            "%scala\nList(1,2,3)",
            html_pattern="res0.*List.*Int.*List.*1.*2.*3",
            timeout=80)


@pytest.mark.skipif(
    True,
    reason="scala jupyter kernel broken in 18.04")
class TestScala211Mode:
    # example from ScalaTour-1.6, p. 31, Pattern Matching
    # http://www.scala-lang.org/docu/files/ScalaTour-1.6.pdf
    def test_scala211_pat1(self, exec2):
        code = dedent('''
        %scala211
        object MatchTest1 extends App {
          def matchTest(x: Int): String = x match {
            case 1 => "one"
            case 2 => "two"
            case _ => "many"
          }
          println(matchTest(3))
        }
        ''').strip()
        exec2(code, html_pattern="defined.*object.*MatchTest1", timeout=80)

    def test_scala211_pat2(self, exec2):
        exec2("%scala211\nMatchTest1.main(Array())", pattern="many")

    def test_scala_version(self, exec2):
        exec2(
            "%scala211\nutil.Properties.versionString", html_pattern="2.11.11")


class TestAnaconda5:
    def test_anaconda_version(self, exec2):
        exec2(
            "%anaconda\nimport sys\nprint(sys.version)",
            pattern=r"^3\.6\.\d+ ")

    def test_anaconda_kernel_name(self, exec2):
        exec2("anaconda.jupyter_kernel.kernel_name", "anaconda5")

class TestPython3Mode:
    def test_p3_max(self, exec2):
        exec2("%python3\nmax([],default=9)", "9", timeout=30)

    def test_p3_kernel_name(self, exec2):
        exec2("python3.jupyter_kernel.kernel_name", "python3")

    def test_p3_version(self, exec2):
        exec2(
            "%python3\nimport sys\nprint(sys.version)", pattern=r"^3\.6\.\d+ ")

    def test_capture_p3_01(self, exec2):
        exec2(
            "%capture(stdout='output')\n%python3\nimport numpy as np\nnp.arange(9).reshape(3,3).trace()"
        )

    def test_capture_p3_02(self, exec2):
        exec2("print(output)", "12\n")

    def test_p3_latex(self, exec2):
        code = r"""%python3
from IPython.display import Math
Math(r'F(k) = \int_{-\infty}^{\infty} f(x) e^{2\pi i k} dx')"""
        htmp = r"""\$\$F\(k\) = \\int_\{-\\infty\}\^\{\\infty\} f\(x\) e\^\{2\\pi i k\} dx\$\$"""
        exec2(code, html_pattern=htmp)

    def test_p3_pandas(self, exec2):
        code = dedent('''
        %python3
        import pandas as pd
        from io import StringIO

        df_csv = r"""Item,Category,Quantity,Weight
        Pack,Pack,1,33.0
        Tent,Shelter,1,80.0
        Sleeping Pad,Sleep,0,27.0
        Sleeping Bag,Sleep,1,20.0
        Shoes,Clothing,1,12.0
        Hat,Clothing,1,2.5"""
        mydata = pd.read_csv(StringIO(df_csv))
        mydata.shape''').strip()
        exec2(code, "(6, 4)")

    def test_p3_autocomplete(self, execintrospect):
        execintrospect('myd', ["ata"], 'myd', '%python3')


class TestPython3DefaultMode:
    def test_set_python3_mode(self, exec2):
        exec2("%default_mode python3")

    def test_python3_assignment(self, exec2):
        exec2("xx=[2,5,99]\nsum(xx)", "106")

    def test_capture_p3d_01(self, exec2):
        exec2("%capture(stdout='output')\nmax(xx)")

    def test_capture_p3d_02(self, exec2):
        exec2("%sage\nprint(output)", "99\n")


class TestShMode:
    def test_start_sh(self, exec2):
        code = "%sh\ndate +%Y-%m-%d"
        patn = r'\d{4}-\d{2}-\d{2}'
        exec2(code, pattern=patn)

    # examples from sh mode docstring in sage_salvus.py
    # note jupyter kernel text ouput is displayed as html
    def test_single_line(self, exec2):
        exec2("%sh uptime\n", pattern="\d\.\d")

    def test_multiline(self, exec2):
        exec2("%sh\nFOO=hello\necho $FOO", pattern="hello")

    def test_direct_call(self, exec2):
        exec2("sh('date +%Y-%m-%d')", pattern=r'\d{4}-\d{2}-\d{2}')

    def test_capture_sh_01(self, exec2):
        exec2("%capture(stdout='output')\n%sh uptime")

    def test_capture_sh_02(self, exec2):
        exec2("output", pattern="up.*user.*load average")

    def test_remember_settings_01(self, exec2):
        exec2("%sh FOO='testing123'")

    def test_remember_settings_02(self, exec2):
        exec2("%sh echo $FOO", pattern=r"^testing123\s+")

    def test_sh_display(self, execblob, image_file):
        execblob("%sh display < " + str(image_file), want_html=False)

    def test_sh_autocomplete_01(self, exec2):
        exec2("%sh TESTVAR29=xyz")

    def test_sh_autocomplete_02(self, execintrospect):
        execintrospect('echo $TESTV', ["AR29"], '$TESTV', '%sh')

    def test_bad_command(self, exec2):
        exec2("%sh xyz", pattern="command not found")


class TestShDefaultMode:
    def test_start_sh_dflt(self, exec2):
        exec2("%default_mode sh")

    def test_multiline_dflt(self, exec2):
        exec2("FOO=hello\necho $FOO", pattern="^hello")

    def test_date(self, exec2):
        exec2("date +%Y-%m-%d", pattern=r'^\d{4}-\d{2}-\d{2}')

    def test_capture_sh_01_dflt(self, exec2):
        exec2("%capture(stdout='output')\nuptime")

    def test_capture_sh_02_dflt(self, exec2):
        exec2("%sage\noutput", pattern="up.*user.*load average")

    def test_remember_settings_01_dflt(self, exec2):
        exec2("FOO='testing123'")

    def test_remember_settings_02_dflt(self, exec2):
        exec2("echo $FOO", pattern=r"^testing123\s+")

    def test_sh_display_dflt(self, execblob, image_file):
        execblob("display < " + str(image_file), want_html=False)

    def test_sh_autocomplete_01_dflt(self, exec2):
        exec2("TESTVAR29=xyz")

    def test_sh_autocomplete_02_dflt(self, execintrospect):
        execintrospect('echo $TESTV', ["AR29"], '$TESTV')


class TestRMode:
    def test_r_assignment(self, exec2):
        exec2("%r\nxx <- c(4,7,13)\nmean(xx)", html_pattern="^8$")

    def test_r_version(self, exec2):
        exec2("%r\nR.version.string", html_pattern=r"\d+\.\d+\.\d+")

    def test_capture_r_01(self, exec2):
        exec2("%capture(stdout='output')\n%r\nsum(xx)")

    def test_capture_r_02(self, exec2):
        exec2("print(output)", "24\n")


class TestRDefaultMode:
    def test_set_r_mode(self, exec2):
        exec2("%default_mode r")

    def test_rdflt_assignment(self, exec2):
        exec2("xx <- c(4,7,13)\nmean(xx)", html_pattern="^8$")

    def test_dflt_capture_r_01(self, exec2):
        exec2("%capture(stdout='output')\nsum(xx)")

    def test_dflt_capture_r_02(self, exec2):
        exec2("%sage\nprint(output)", "24\n")


class TestRWD:
    "issue 240"

    def test_wd0(self, exec2, data_path):
        dp = data_path.strpath
        code = "os.chdir('%s')" % dp
        exec2(code)

    def test_wd(self, exec2, data_path):
        dp = data_path.strpath
        exec2("%r\ngetwd()", html_pattern=dp)


class TestOctaveMode:
    def test_start_octave(self, exec2):
        exec2("%octave")

    def test_octave_calc(self, exec2):
        code = "%octave\nformat short\nbesselh(0,2)"
        outp = r"ans =  0.22389\s+\+\s+0.51038i"
        exec2(code, pattern=outp)

    def test_octave_fibonacci(self, exec2):
        code = dedent('''%octave
        fib = ones (1, 10);
        for i = 3:10
            fib(i) = fib(i-1) + fib(i-2);
            printf('%d,', fib(i))
        endfor
        ''')
        outp = '2,3,5,8,13,21,34,55,'
        exec2(code, pattern=outp)

    def test_octave_insync(self, exec2):
        # this just confirms, that input/output is still in sync after the for loop above
        exec2('%octave\n1+1', pattern='ans =  2')


class TestOctaveDefaultMode:
    def test_octave_capture1(self, exec2):
        exec2("%default_mode octave")

    def test_octave_capture2(self, exec2):
        exec2("%capture(stdout='output')\nx = [1,2]")

    def test_octave_capture3(self, exec2):
        exec2("%sage\nprint(output)", pattern="   1   2")

    def test_octave_version(self, exec2):
        exec2("version()", pattern="4.2.2")


class TestAnaconda2019Mode:
    def test_start_a2019(self, exec2):
        exec2('a2019 = jupyter("anaconda2019")')

    def test_issue_862(self, exec2):
        exec2('%a2019\nx=1\nprint("x = %s" % x)\nx', 'x = 1\n')

    def test_a2019_error(self, exec2):
        exec2('%a2019\nxyz*', html_pattern='span style.*color')


class TestAnaconda5Mode:
    def test_start_a5(self, exec2):
        exec2('a5 = jupyter("anaconda5")')

    def test_issue_862(self, exec2):
        exec2('%a5\nx=1\nprint("x = %s" % x)\nx', 'x = 1\n')

    def test_a5_error(self, exec2):
        exec2('%a5\nxyz*', html_pattern='span style.*color')


class TestJuliaMode:
    def test_julia_quadratic(self, exec2):
        exec2(
            '%julia\nquadratic(a, sqr_term, b) = (-b + sqr_term) / 2a\nquadratic(2.0, -2.0, -12.0)',
            '2.5',
            timeout=40)

    def test_julia_version(self, exec2):
        exec2("%julia\nVERSION", pattern=r'^v"1\.1\.\d+"', timeout=40)
