#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

require('ts-node').register()

expect = require('expect')

misc = require('smc-util/misc')

misc_node = require('../misc_node')
misc2_node = require('../misc')

describe 'computing a sha1 hash: ', ->
    expect(misc_node.sha1("SageMathCloud")).toBe('31acd8ca91346abcf6a49d2b1d88333f439d57a6')
    expect(misc_node.sha1("CoCalc")).toBe('c898c97dca68742a5a6331f9fa0ca02483cbfd25')

describe "execute code", ->
    ex = require("smc-util-node/execute-code").execute_code

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

## list of WA_zips retriven this way:
# import pandas as pd
# import json
# import requests
# url = 'https://www.unitedstateszipcodes.org/wa/'
# data = pd.read_html(requests.get(url,  headers={'User-agent': 'Mozilla/5.0'}).text,  attrs={"class":"table-striped"})
# x = data[1]
# y = x['ZIP Code'].as_matrix().tolist()
# json.dumps(y)

WA_zips = [98001, 98002, 98003, 98004, 98005, 98006, 98007, 98008, 98009, 98010, 98011, 98012, 98013, 98014, 98015, 98019, 98020, 98021, 98022, 98023, 98024, 98025, 98026, 98027, 98028, 98029, 98030, 98031, 98032, 98033, 98034, 98035, 98036, 98037, 98038, 98039, 98040, 98041, 98042, 98043, 98045, 98046, 98047, 98050, 98051, 98052, 98053, 98054, 98055, 98056, 98057, 98058, 98059, 98061, 98062, 98063, 98064, 98065, 98068, 98070, 98071, 98072, 98073, 98074, 98075, 98077, 98082, 98083, 98087, 98089, 98092, 98093, 98101, 98102, 98103, 98104, 98105, 98106, 98107, 98108, 98109, 98110, 98111, 98112, 98113, 98114, 98115, 98116, 98117, 98118, 98119, 98121, 98122, 98124, 98125, 98126, 98127, 98129, 98131, 98132, 98133, 98134, 98136, 98138, 98139, 98141, 98144, 98145, 98146, 98148, 98151, 98154, 98155, 98158, 98160, 98161, 98164, 98165, 98166, 98168, 98170, 98171, 98174, 98175, 98177, 98178, 98181, 98184, 98185, 98188, 98189, 98190, 98191, 98194, 98195, 98198, 98199, 98201, 98203, 98204, 98205, 98206, 98207, 98208, 98213, 98220, 98221, 98222, 98223, 98224, 98225, 98226, 98227, 98228, 98229, 98230, 98231, 98232, 98233, 98235, 98236, 98237, 98238, 98239, 98240, 98241, 98243, 98244, 98245, 98247, 98248, 98249, 98250, 98251, 98252, 98253, 98255, 98256, 98257, 98258, 98259, 98260, 98261, 98262, 98263, 98264, 98266, 98267, 98270, 98271, 98272, 98273, 98274, 98275, 98276, 98277, 98278, 98279, 98280, 98281, 98282, 98283, 98284, 98286, 98287, 98288, 98290, 98291, 98292, 98293, 98294, 98295, 98296, 98297, 98303, 98304, 98305, 98310, 98311, 98312, 98314, 98315, 98320, 98321, 98322, 98323, 98324, 98325, 98326, 98327, 98328, 98329, 98330, 98331, 98332, 98333, 98335, 98336, 98337, 98338, 98339, 98340, 98342, 98343, 98344, 98345, 98346, 98348, 98349, 98350, 98351, 98352, 98353, 98354, 98355, 98356, 98357, 98358, 98359, 98360, 98361, 98362, 98363, 98364, 98365, 98366, 98367, 98368, 98370, 98371, 98372, 98373, 98374, 98375, 98376, 98377, 98378, 98380, 98381, 98382, 98383, 98384, 98385, 98386, 98387, 98388, 98390, 98391, 98392, 98393, 98394, 98395, 98396, 98397, 98398, 98401, 98402, 98403, 98404, 98405, 98406, 98407, 98408, 98409, 98411, 98412, 98413, 98415, 98416, 98417, 98418, 98419, 98421, 98422, 98424, 98430, 98431, 98433, 98438, 98439, 98442, 98443, 98444, 98445, 98446, 98447, 98448, 98450, 98455, 98460, 98464, 98465, 98466, 98467, 98471, 98477, 98481, 98490, 98492, 98493, 98496, 98497, 98498, 98499, 98501, 98502, 98503, 98504, 98505, 98506, 98507, 98508, 98509, 98511, 98512, 98513, 98516, 98520, 98522, 98524, 98526, 98527, 98528, 98530, 98531, 98532, 98533, 98535, 98536, 98537, 98538, 98539, 98540, 98541, 98542, 98544, 98546, 98547, 98548, 98550, 98552, 98554, 98555, 98556, 98557, 98558, 98559, 98560, 98561, 98562, 98563, 98564, 98565, 98566, 98568, 98569, 98570, 98571, 98572, 98575, 98576, 98577, 98579, 98580, 98581, 98582, 98583, 98584, 98585, 98586, 98587, 98588, 98589, 98590, 98591, 98592, 98593, 98595, 98596, 98597, 98599, 98601, 98602, 98603, 98604, 98605, 98606, 98607, 98609, 98610, 98611, 98612, 98613, 98614, 98616, 98617, 98619, 98620, 98621, 98622, 98623, 98624, 98625, 98626, 98628, 98629, 98631, 98632, 98635, 98637, 98638, 98639, 98640, 98641, 98642, 98643, 98644, 98645, 98647, 98648, 98649, 98650, 98651, 98660, 98661, 98662, 98663, 98664, 98665, 98666, 98667, 98668, 98670, 98671, 98672, 98673, 98674, 98675, 98682, 98683, 98684, 98685, 98686, 98687, 98801, 98802, 98807, 98811, 98812, 98813, 98814, 98815, 98816, 98817, 98819, 98821, 98822, 98823, 98824, 98826, 98827, 98828, 98829, 98830, 98831, 98832, 98833, 98834, 98836, 98837, 98840, 98841, 98843, 98844, 98845, 98846, 98847, 98848, 98849, 98850, 98851, 98852, 98853, 98855, 98856, 98857, 98858, 98859, 98860, 98862, 98901, 98902, 98903, 98904, 98907, 98908, 98909, 98920, 98921, 98922, 98923, 98925, 98926, 98929, 98930, 98932, 98933, 98934, 98935, 98936, 98937, 98938, 98939, 98940, 98941, 98942, 98943, 98944, 98946, 98947, 98948, 98950, 98951, 98952, 98953, 99001, 99003, 99004, 99005, 99006, 99008, 99009, 99011, 99012, 99013, 99014, 99016, 99017, 99018, 99019, 99020, 99021, 99022, 99023, 99025, 99026, 99027, 99029, 99030, 99031, 99032, 99033, 99034, 99036, 99037, 99039, 99040, 99101, 99102, 99103, 99104, 99105, 99107, 99109, 99110, 99111, 99113, 99114, 99115, 99116, 99117, 99118, 99119, 99121, 99122, 99123, 99124, 99125, 99126, 99128, 99129, 99130, 99131, 99133, 99134, 99135, 99136, 99137, 99138, 99139, 99140, 99141, 99143, 99144, 99146, 99147, 99148, 99149, 99150, 99151, 99152, 99153, 99154, 99155, 99156, 99157, 99158, 99159, 99160, 99161, 99163, 99164, 99165, 99166, 99167, 99169, 99170, 99171, 99173, 99174, 99176, 99179, 99180, 99181, 99185, 99201, 99202, 99203, 99204, 99205, 99206, 99207, 99208, 99209, 99210, 99211, 99212, 99213, 99214, 99215, 99216, 99217, 99218, 99219, 99220, 99223, 99224, 99228, 99251, 99252, 99256, 99258, 99260, 99299, 99301, 99302, 99320, 99321, 99322, 99323, 99324, 99326, 99328, 99329, 99330, 99333, 99335, 99336, 99337, 99338, 99341, 99343, 99344, 99345, 99346, 99347, 99348, 99349, 99350, 99352, 99353, 99354, 99356, 99357, 99359, 99360, 99361, 99362, 99363, 99371, 99401, 99402, 99403]

describe 'check sales tax work', ->
    sales_tax = misc_node.sales_tax

    it 'knows about 98122', ->
        expect(sales_tax('98122')).toBe 0.10100
    it 'knows all expected zip codes', ->
        for zip in WA_zips
            v = sales_tax(zip)
            upper_bound = 0.2000
            lower_bound = 0.0650
            expect(v).toBeLessThan(upper_bound, "sales tax for #{zip} was #{v} but should be less than #{upper_bound}")
            expect(v).toBeGreaterThan(lower_bound, "sales tax for #{zip} was #{v} but should be greater than #{lower_bound}")


describe 'do not allow URLs in names', ->
    {is_valid_username} = misc2_node

    it 'works for usual names', ->
        expect(is_valid_username("harald")).toBe(undefined)
        expect(is_valid_username("ABC FOO-BAR")).toBe(undefined)
        # DNS-like substrings easily trigger a violoation. these are fine, though
        # this was relaxed in commit cafbf9c900f917
        expect(is_valid_username("is.test.ok")).toExist() #.toBe(undefined)
        expect(is_valid_username("is.a.test")).toExist() #.toBe(undefined)

    it 'blocks suspicious names', ->
        expect(is_valid_username("OPEN http://foo.com")).toExist()
        expect(is_valid_username("https://earn-money.cc is good" )).toExist()
        expect(is_valid_username("OPEN mailto:bla@bar.de")).toExist()

    it 'is not fooled to easily', ->
        expect(is_valid_username("OPEN hTTp://foo.com")).toExist()
        expect(is_valid_username("httpS://earn-money.cc is good" )).toExist()
        expect(is_valid_username("OPEN MAILTO:bla@bar.de")).toExist()
        expect(is_valid_username("test.account.dot")).toInclude("test.account.dot")
        expect(is_valid_username("no spam EARN-A-LOT-OF.money Now")).toInclude(".money")
        expect(is_valid_username("spam abc.co earn")).toInclude(".co")
