# test_sagews.py
# basic tests of sage worksheet using TCP protocol with sage_server
import socket
import conftest
import os
import re

from textwrap import dedent

class TestErr:
    def test_non_ascii(self, test_id, sagews):
        # assign x to hbar to trigger non-ascii warning
        code = ("x = " + unichr(295) + "\nx").encode('utf-8')
        m = conftest.message.execute_code(code = code, id = test_id)
        sagews.send_json(m)
        # expect 3 messages from worksheet client, including final done:true
        # 1 stderr Error in lines 1-1
        typ, mesg = sagews.recv()
        assert typ == 'json'
        assert mesg['id'] == test_id
        assert 'stderr' in mesg
        assert 'Error in lines 1-1' in mesg['stderr']
        # 2 stderr WARNING: Code contains non-ascii characters
        typ, mesg = sagews.recv()
        assert typ == 'json'
        assert mesg['id'] == test_id
        assert 'stderr' in mesg
        assert 'WARNING: Code contains non-ascii characters' in mesg['stderr']
        # 3 done
        conftest.recv_til_done(sagews, test_id)

class TestLinearAlgebra:
    def test_solve_right(self, exec2):
        code = dedent(r"""
        A=matrix([[1,2,6],[1,2,0],[1,-2,3]])
        b=vector([1,-1,1])
        A.solve_right(b)""")
        exec2(code,"(-1/2, -1/4, 1/3)\n")

    def test_kernel(self, exec2):
        code = dedent(r"""
        A=matrix([[1,2,3],[1,2,3],[1,2,3]])
        kernel(A)""")
        pat = "\[ 1  0 -1\]\n\[ 0  1 -1\]"
        exec2(code, pattern = pat)

    def test_charpoly(self, exec2):
        code = dedent(r"""
        A=matrix([[1,2,3],[1,2,3],[1,2,3]])
        A.charpoly()""")
        exec2(code, "x^3 - 6*x^2\n")

    def test_eigenvalues(self, exec2):
        code = dedent(r"""
        A=matrix([[1,2,3],[1,2,3],[1,2,3]])
        A=matrix([[1,2,3],[1,2,3],[1,2,3]])
        A.eigenvalues()""")
        exec2(code, "[6, 0, 0]\n")

class TestBasic:
    def test_connection_type(self, sagews):
        print("type %s"%type(sagews))
        assert isinstance(sagews, conftest.ConnectionJSON)
        return

    def test_set_file_env(self, exec2):
        code = "os.chdir(salvus.data[\'path\']);__file__=salvus.data[\'file\']"
        exec2(code)

    def test_sage_assignment(self, exec2):
        code = "x = 42\nx\n"
        output = "42\n"
        exec2(code, output)

    def test_issue70(self, exec2):
        code = dedent(r"""
        for i in range(1):
            pass
        'x'
        """)
        output = dedent(r"""
        'x'
        """).lstrip()
        exec2(code, output)

    def test_issue819(self, exec2):
        code = dedent(r"""
        def never_called(a):
            print 'should not execute 1', a
            # comment
        # comment at indent 0
            print 'should not execute 2', a
        22
        """)
        output = "22\n"
        exec2(code, output)

    def test_search_doc(self, exec2):
        code = "search_doc('laurent')"
        html = "https://www.google.com/search\?q=site%3Adoc.sagemath.org\+laurent\&oq=site%3Adoc.sagemath.org"
        exec2(code, html_pattern = html)

    def test_show_doc(self, test_id, sagews):
        # issue 476
        code = "show?"
        patn = "import smc_sagews.graphics\nsmc_sagews.graphics.graph_to_d3_jsonable?"
        m = conftest.message.execute_code(code = code, id = test_id)
        sagews.send_json(m)
        typ, mesg = sagews.recv()
        assert typ == 'json'
        assert mesg['id'] == test_id
        assert 'code' in mesg
        assert 'source' in mesg['code']
        assert re.sub('\s+','',patn) in re.sub('\s+','',mesg['code']['source'])
        conftest.recv_til_done(sagews, test_id)

    # https://github.com/sagemathinc/smc/issues/1107
    def test_sage_underscore_1(self, exec2):
        exec2("2/5","2/5\n")
    def test_sage_underscore_2(self, exec2):
        exec2("_","2/5\n")

    # https://github.com/sagemathinc/smc/issues/978
    def test_mode_comments_1(self, exec2):
        exec2(dedent("""
        def f(s):
            print "s='%s'"%s"""))
    def test_mode_comments_2(self, exec2):
        exec2(dedent("""
        %f
        123
        # foo
        456"""), dedent("""
        s='123
        # foo
        456'
        """).lstrip())

    def test_block_parser(self, exec2):
        """
        .. NOTE::

            This function supplies a list of expected outputs to `exec2`.
        """
        exec2(dedent("""
        pi.n().round()
        [x for x in [1,2,3] if x<3]
        for z in ['a','b']:
            z
        else:
            z"""), ["3\n","[1, 2]\n","'a'\n'b'\n'b'\n"])

class TestIntrospect:
    # test names end with SMC issue number
    def test_sage_autocomplete_1188(self, execintrospect):
        execintrospect('2016.fa', ["ctor","ctorial"], "fa")
    def test_sage_autocomplete_295_setup(self, exec2):
        exec2("aaa=Rings()._super_categories_for_classes;len(aaa[0].axioms())","6\n")
    def test_sage_autocomplete_295a(self, execintrospect):
        execintrospect('for a in aa', ["a"], "aa")
    def test_sage_autocomplete_295b(self, execintrospect):
        execintrospect('3 * aa', ["a"], "aa")
    def test_sage_autocomplete_701_setup(self, exec2):
        exec2(dedent("""
        class Xyz:
            numerical_attribute = 42
        x1 = Xyz()
        x1.numerical_attribute.next_prime()"""),"43\n")
    def test_sage_autocomplete_701a(self, execintrospect):
        execintrospect('3 / x1.nu', ["merical_attribute"], "nu")
    def test_sage_autocomplete_701b(self, execintrospect):
        execintrospect('aa', ["a"], "aa")
    def test_sage_autocomplete_701c(self, execintrospect):
        execintrospect('[aa', ["a"], "aa")
    def test_sage_autocomplete_701d(self, execintrospect):
        execintrospect('( aa', ["a"], "aa")
    def test_sage_autocomplete_734a(self, execintrospect):
        f = '*_factors'
        execintrospect(f, ["cunningham_prime_factors", "prime_factors"], f)
    def test_sage_autocomplete_734b(self, execintrospect):
        f = '*le_pr*'
        execintrospect(f, ["next_probable_prime"], f)
    def test_sage_autocomplete_734c(self, execintrospect):
        execintrospect('list.re*e', ["remove", "reverse"], 're*e')
    def test_sage_autocomplete_1225a(self, execintrospect):
        execintrospect('z = 12.5 * units.len', ["gth"], 'len')
    def test_sage_autocomplete_1225b_setup(self, exec2):
        exec2(dedent("""
        class TC:
            def __init__(self, xval):
                self.x = xval
        y = TC(49)
        """))
    def test_sage_autocomplete_1225b(self, execintrospect):
        execintrospect('z = 12 * y.', ["x"], '')
    def test_sage_autocomplete_1252a(self, execintrospect):
        execintrospect('2*sqr', ["t"], 'sqr')
    def test_sage_autocomplete_1252b(self, execintrospect):
        execintrospect('2+sqr', ["t"], 'sqr')

class TestAttach:
    def test_define_paf(self, exec2):
        exec2(dedent(r"""
        def paf():
            print("attached files: %d"%len(attached_files()))
            print("\n".join(attached_files()))
        paf()"""),"attached files: 0\n\n")
    def test_attach_sage_1(self, exec2, test_ro_data_dir):
        fn = os.path.join(test_ro_data_dir, 'a.sage')
        exec2("%attach {}\npaf()".format(fn), pattern="attached files: 1\n.*/a.sage\n")
    def test_attach_sage_2(self, exec2):
        exec2("f1('foo')","f1 arg = 'foo'\ntest f1 1\n")
    def test_attach_py_1(self, exec2, test_ro_data_dir):
        fn = os.path.join(test_ro_data_dir, 'a.py')
        exec2("%attach {}\npaf()".format(fn), pattern="attached files: 2\n.*/a.py\n.*/a.sage\n")
    def test_attach_py_2(self, exec2):
        exec2("f2('foo')","test f2 1\n")
    def test_attach_html_1(self, execblob, test_ro_data_dir):
        fn = os.path.join(test_ro_data_dir, 'a.html')
        execblob("%attach {}".format(fn), want_html=False, want_javascript=True, file_type='html')
    def test_attach_html_2(self, exec2):
        exec2("paf()", pattern="attached files: 3\n.*/a.html\n.*/a.py\n.*/a.sage\n")
    def test_detach_1(self, exec2):
        exec2("detach(attached_files())")
    def test_detach_2(self, exec2):
        exec2("paf()","attached files: 0\n\n")

class TestSearchSrc:
    def test_search_src_simple(self, execinteract):
        execinteract('search_src("convolution")')

    def test_search_src_max_chars(self, execinteract):
        execinteract('search_src("full cremonadatabase", max_chars = 1000)')

class TestIdentifiers:
    """
    see SMC issue #63
    """
    def test_ident_set_file_env(self, exec2):
        """emulate initial code block sent from UI, needed for first show_identifiers"""
        code = "os.chdir(salvus.data[\'path\']);__file__=salvus.data[\'file\']"
        exec2(code)
    def test_show_identifiers_initial(self, exec2):
        exec2("show_identifiers()","[]\n")

    def test_show_identifiers_vars(self, exec2):
        code = dedent(r"""
        k = ['a','b','c']
        A = {'a':'foo','b':'bar','c':'baz'}
        z = 99
        sorted(show_identifiers())""")
        exec2(code, "['A', 'k', 'z']\n")

    def test_save_and_reset(self,exec2,data_path):
        code = dedent(r"""
        save_session('%s')
        reset()
        show_identifiers()""")%data_path.join('session').strpath
        exec2(code,"[]\n")
    def test_load_session1(self,exec2,data_path):
        code = dedent(r"""
        pretty_print = 8
        view = 9
        load_session('%s')
        sorted(show_identifiers())""")%data_path.join('session').strpath
        output = "['A', 'k', 'pretty_print', 'view', 'z']\n"
        exec2(code,output)
    def test_load_session2(self,exec2):
        exec2("pretty_print,view","(8, 9)\n")

    def test_redefine_sage(self,exec2):
        code = dedent(r"""
        reset()
        sage=1
        show_identifiers()""")
        exec2(code,"['sage']\n")
