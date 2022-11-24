#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

require('ts-node').register()

expect = require('expect')

misc = require('@cocalc/util/misc')

misc_node = require('../misc_node')
misc2_node = require('../misc')

describe 'computing a sha1 hash: ', ->
    expect(misc_node.sha1("SageMathCloud")).toBe('31acd8ca91346abcf6a49d2b1d88333f439d57a6')
    expect(misc_node.sha1("CoCalc")).toBe('c898c97dca68742a5a6331f9fa0ca02483cbfd25')

describe "execute code", ->
    ex = require("@cocalc/backend/execute-code").execute_code

    it "runs normal code in bash", (done) =>
        ex
            command : "echo 'abc' | wc -c"
            cb      : (err, ret) ->
                expect(err).toBe(null)
                expect(ret.stdout).toBe("4\n")
                done()

    # not sure how to test, at least it does something
    it "doesn't use bash if told so", (done) =>
        ex
            command : "echo"
            args    : ['abc']
            bash    : false
            cb      : (err, ret) ->
                expect(err).toBe(null)
                expect(ret.stdout).toBe("abc\n")
                done()

    it "kills if timeout reached", (done) =>
        ex
            command : "sleep 5"
            timeout : 0.1
            cb      : (err, ret) ->
                expect(err).toContain('killed command')
                done()

    it "kills in non-bash mode if timeout reached", (done) =>
        ex
            command : "sh"
            args    : ['-c', "sleep 5"]
            bash    : false
            timeout : 0.1
            cb      : (err, ret) ->
                expect(err).toContain('killed command')
                done()

    it "reports missing executable in non-bash mode", (done) =>
        ex
            command : "this_does_not_exist"
            args    : ['nothing']
            bash    : false
            cb      : (err, ret) ->
                expect(err).toExist()
                expect(ret).toExist()
                expect(err).toContain('"errno":"ENOENT"')
                err_data = misc.from_json(ret.stderr)
                expect(err_data.code).toBe('ENOENT')
                expect(err_data.errno).toBe('ENOENT')
                done()

    it "reports missing executable in non-bash mode and when ignoring error codes on exit", (done) =>
        ex
            command     : "this_does_not_exist"
            args        : ['nothing']
            bash        : false
            err_on_exit : false
            cb          : (err, ret) ->
                expect(err).toExist()
                expect(ret).toExist()
                expect(err).toContain('"errno":"ENOENT"')
                err_data = misc.from_json(ret.stderr)
                expect(err_data.code).toBe('ENOENT')
                expect(err_data.errno).toBe('ENOENT')
                done()

    it "ignores errors otherwise if err_on_exit is false", (done) =>
        ex
            command     : "sh"
            args        : ['-c', 'echo foo; exit 42']
            bash        : false
            err_on_exit : false
            cb          : (err, ret) ->
                expect(err).toBe(false)
                expect(ret.stdout).toBe('foo\n')
                expect(ret.stderr).toBe('')
                expect(ret.exit_code).toBe(42)
                done()

describe "sanitizing HTML", ->
    sani     = misc_node.sanitize_html
    saniSafe = misc_node.sanitize_html_safe

    @timeout(10000)
    it "works with plain text and knowns some utf8", (done) =>
        sani "foo & BAR &amp; Baz &rarr; &mdash; &ouml;", (ret) ->
            expect(ret).toBe("foo &amp; BAR &amp; Baz → — ö")
            done()

    it "closes open tags", (done) =>
        sani "<p>hello", (ret) ->
            expect(ret).toBe("<p>hello</p>")
            done()

    it "allows fairly complex html", (done) =>
        exp = '<h1>title</h1><h2>tag</h2><div>this <img src="foo.png"> is</div>'
        sani '<h1>title</h1><h2>tag</h2><div>this <img src="foo.png"> is', (ret) ->
            expect(ret).toBe(exp)
            done()

    it "tables are fine", (done) =>
        exp = '<table><thead><tr><th>x</th></tr></thead><tbody><tr><td>TD</td></tr></tbody><tfoot><tr><th>Y</th></tr></tfoot></table>'
        sani '<table><thead><tr><th>x</th></thead><tbody><tr><td>TD</td></tr></tbody><tfoot><tr><th>Y</th>', (ret) ->
            expect(ret).toBe(exp)
            done()

    it "works with a-hrefs, normalizing attributes and quotes", (done) =>
        exp = '<a href="foo" name="bar" target="_blank">text<b>baz</b></a>'
        sani '''<a href="foo" name=bar target='_blank'>text<b>baz</a>''', (ret) ->
            expect(ret).toBe(exp)
            done()

    it "works with a-hrefs, normalizing ampersands in URLs", (done) =>
        exp = '<a href="http://x/y.html&amp;z=0#bar">z</a>'
        sani '<a href="http://x/y.html&z=0#bar">z</a>', (ret) ->
            expect(ret).toBe(exp)
            done()

    it "fixes image tags and allows the style attribute", (done) =>
        exp = '<img src="foo.png" style="width: 100%">'
        sani '''<img    src='foo.png' style="width: 100%"></img>''', (ret) ->
            expect(ret).toBe(exp)
            done()

    it "by default, does NOT get rid of onload tags", (done) =>
        exp = '<img onload="javascript:alert(1);" src="http://test.com/test.png">'
        sani exp, (ret) =>
            expect(ret).toBe(exp)
            done()

    it "by default, does NOT remove <script> tags", (done) =>
        exp = '<div><p>hey</p><script>alert("you!");</script></div>'
        sani exp, (ret) ->
            expect(ret).toBe(exp)
            done()

    it "safeMode takes care of <script> tags", (done) =>
        exp = '<div><p>hey</p></div>'
        saniSafe '<div><p>hey</p><script>alert("you!");</script></div>', (ret) ->
            expect(ret).toBe(exp)
            done()

    it "safeMode takes care of onload tags", (done) =>
        exp = '<img src="http://test.com/test.png">'
        saniSafe '<img onload="javascript:alert(1);" src="http://test.com/test.png">', (ret) =>
            expect(ret).toBe(exp)
            done()
