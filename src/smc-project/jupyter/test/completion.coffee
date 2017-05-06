###
Test completion API
###

expect  = require('expect')

common = require('./common')

# global kernel being tested at any point.
kernel = undefined

# This checks that on input the given obj={code:?, cursor_pos:?}
# the resulting matches *contains* matches
check = (obj, matches) ->
    it "checks that #{JSON.stringify(obj)} includes #{if matches then JSON.stringify(matches) else 'nothing'}", (done) ->
        kernel.complete
            code       : obj.code
            cursor_pos : obj.cursor_pos ? obj.code.length
            cb         : (err, resp) ->
                if err
                    done(err)
                else
                    if not matches?
                        expect(resp.matches.length).toBe(0)
                    else
                        for m in matches
                            expect(resp.matches).toContain(m)
                    done()



describe "complete some things using python2 kernel -- ", ->
    @timeout(10000)

    it 'creates a python2 kernel', ->
        kernel = common.kernel('python2')

    it "complete 'imp'", (done) ->
        kernel.complete
            code       : 'imp'
            cursor_pos : 2
            cb         : (err, resp) ->
                if err
                    done(err)
                else
                    expect(resp).toEqual({matches: [ 'import' ], status: 'ok', cursor_start: 0, cursor_end: 2 })
                    done()

    check({code:'imp'}, ['import'])
    check({code:'in'}, [ 'in', 'input', 'int', 'intern' ])
    check({code:'in', cursor_pos:1}, [ 'id', 'if', 'import', 'in', 'input', 'int', 'intern', 'is', 'isinstance', 'issubclass', 'iter' ])

    check({code:"alsdfl"})

    it 'creates a new identifier', (done) ->
        kernel.execute_code
            code : 'alsdfl = {"foo":"bar"}'
            all  : true
            cb   : done

    check({code:"alsdfl"}, ['alsdfl'])

    check({code:"alsdfl._"}, ['alsdfl.__class__', 'alsdfl.__cmp__'])

    it 'closes the kernel', ->
        kernel.close()


describe "complete some things using sage kernel -- ", ->
    @timeout(30000)

    it 'creates a sage kernel', ->
        kernel = common.kernel('sagemath')

    check({code:'Ell'}, ['Ellipsis', 'EllipticCurve', 'EllipticCurve_from_c4c6', 'EllipticCurve_from_cubic', 'EllipticCurve_from_j', 'EllipticCurve_from_plane_curve', 'EllipticCurveIsogeny', 'EllipticCurves_with_good_reduction_outside_S' ])

    check({code:'e.'}, ['e.abs', 'e.add', 'e.add_to_both_sides', 'e.additive_order', 'e.arccos'])
    check({code:'e.fac'}, ['e.factor'])

    it 'closes the kernel', ->
        kernel.close()



