###
Do one simple test with each of the kernel we test the cocalc
Jupyter client with.
###

expect  = require('expect')

common = require('./common')

output = (v, f) ->
    for x in v
        if x.content?.data?
            return x.content.data
        if x.content?.text?
            return x.content.text


describe 'compute 4/3 using the python2 kernel -- ', ->
    @timeout(5000)

    kernel = undefined
    it 'evaluate 4/3', (done) ->
        kernel = common.kernel('python2')
        kernel.execute_code
            code : '4/3'
            all  : true
            cb   : (err, v) ->
                if err
                    done(err)
                else
                    expect(output(v)).toEqual({"text/plain":"1"})
                    done()

    it 'closes the kernel', ->
        kernel.close()

describe 'test the bash kernel --', ->
    @timeout(5000)
    kernel = undefined

    it 'pwd', (done) ->
        kernel = common.kernel('bash')
        kernel.execute_code
            code : 'pwd'
            all  : true
            cb   : (err, v) ->
                if err
                    done(err)
                else
                    o = output(v)
                    expect(o.slice(o.length-9)).toBe('/jupyter\n')
                    done()

    it 'closes the kernel', ->
        kernel.close()


describe 'test the python3 kernel --', ->
    @timeout(10000)

    kernel = undefined
    it 'evaluate 4/3', (done) ->
        kernel = common.kernel('python3')
        kernel.execute_code
            code : '4/3'
            all  : true
            cb   : (err, v) ->
                if err
                    done(err)
                else
                    expect(output(v)).toEqual({"text/plain":"1.3333333333333333"})
                    done()

    it 'closes the kernel', ->
        kernel.close()

describe 'test the sage kernel --', ->
    @timeout(30000)

    kernel = undefined
    it 'evaluate 4/3', (done) ->
        kernel = common.kernel('sage')
        kernel.execute_code
            code : '4/3'
            all  : true
            cb   : (err, v) ->
                if err
                    done(err)
                else
                    expect(output(v)).toEqual({"text/plain":"4/3"})
                    done()

    it 'closes the kernel', ->
        kernel.close()

describe 'test the octave kernel --', ->
    @timeout(10000)
    kernel = undefined
    it 'evaluate 4/3', (done) ->
        kernel = common.kernel('octave')
        kernel.execute_code
            code : '4/3'
            all  : true
            cb   : (err, v) ->
                if err
                    done(err)
                else
                    expect(output(v)).toEqual('ans =  1.3333\n' )
                    done()

    it 'closes the kernel', ->
        kernel.close()


describe 'test the julia kernel --', ->
    @timeout(20000)
    kernel = undefined
    it 'evaluate 4/3', (done) ->
        kernel = common.kernel('julia')
        kernel.execute_code
            code : '4/3'
            all  : true
            cb   : (err, v) ->
                if err
                    done(err)
                else
                    console.log output(v)
                    expect(output(v)).toEqual({ 'text/plain': '1.3333333333333333' })
                    done()

    it 'closes the kernel', ->
        kernel.close()


describe 'test the non-sage R kernel --', ->
    @timeout(5000)
    kernel = undefined
    it 'evaluate sd(c(1,2,5))', (done) ->
        kernel = common.kernel('ir')
        kernel.execute_code
            code : 'sd(c(1,2,5))'
            all  : true
            cb   : (err, v) ->
                if err
                    done(err)
                else
                    expect(output(v)).toEqual('todo')
                    done()

    it 'closes the kernel', ->
        kernel.close()

describe 'test the sage R kernel --', ->
    @timeout(5000)
    kernel = undefined
    it 'evaluate sd(c(1,2,5))', (done) ->
        kernel = common.kernel('ir-sage')
        kernel.execute_code
            code : 'sd(c(1,2,5))'
            all  : true
            cb   : (err, v) ->
                if err
                    done(err)
                else
                    expect(output(v)).toEqual('todo')
                    done()

    it 'closes the kernel', ->
        kernel.close()






