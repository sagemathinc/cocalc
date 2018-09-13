expect  = require('expect')

support = require('../../support')

{DNS} = require('smc-util/theme')

body1 = """
foo foo foo
aasdf  ölkj ölkj ölkj
bar https://cocalc.com/projects/14eed217-2d3c-4975-a381-b69edcb40e0e/files/scratch/coffee.sagews?session=default  baz
https://this.not.com/asdf not
or http://www.cocalc.com/asdf?something=123
and this: https://cocalc.com/asdfasdfsafd/asdf.xx
baz
"""

body1_exp = """
foo foo foo
aasdf  ölkj ölkj ölkj
bar https://cocalc.com/projects/14eed217-2d3c-4975-a381-b69edcb40e0e/files/scratch/coffee.sagews?session=  baz
https://this.not.com/asdf not
or http://www.cocalc.com/asdf?something=123&session=
and this: https://cocalc.com/asdfasdfsafd/asdf.xx?session=
baz
"""

describe 'support fixSessions -- ', ->
    fs = support.fixSessions

    it "detects http #{DNS}", ->
        expect(fs("foo http://#{DNS}/foo bar")).toBe("foo http://#{DNS}/foo?session= bar")
    it "detects https #{DNS}", ->
        expect(fs("foo https://#{DNS}/foo bar")).toBe("foo https://#{DNS}/foo?session= bar")

    it "ignores other domains", ->
        x = "test https://bazbar.info/ next"
        expect(fs(x)).toBe(x)

    it 'body1', ->
        expect(fs(body1)).toBe(body1_exp)
