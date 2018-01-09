###
Test backend part of interactive input.
###

expect  = require('expect')

common = require('./common')

describe 'get input using the python2 kernel -- ', ->
    @timeout(10000)
    kernel = undefined

    it 'creates a python2 kernel', ->
        kernel = common.kernel('python2')

    it 'reading input - no prompt', (done) ->
        kernel.execute_code
            code  : 'print(input())'
            all   : true
            stdin : (opts, cb) ->
                expect(opts).toEqual({ password: false, prompt: '' })
                cb(undefined, "'cocalc'")
            cb    : (err, v) ->
                if err
                    done(err)
                else
                    expect(common.output(v)).toEqual('cocalc\n')
                    done()

    it 'reading raw_input - no prompt', (done) ->
        kernel.execute_code
            code  : 'print(raw_input())'
            all   : true
            stdin : (opts, cb) ->
                expect(opts).toEqual({ password: false, prompt: '' })
                cb(undefined, "cocalc")
            cb    : (err, v) ->
                if err
                    done(err)
                else
                    expect(common.output(v)).toEqual('cocalc\n')
                    done()

    it 'reading input - prompt', (done) ->
        kernel.execute_code
            code  : 'print(input("prompt"))'
            all   : true
            stdin : (opts, cb) ->
                expect(opts).toEqual({ password: false, prompt: 'prompt' })
                cb(undefined, "'cocalc'")
            cb    : (err, v) ->
                if err
                    done(err)
                else
                    expect(common.output(v)).toEqual('cocalc\n')
                    done()

    it 'reading raw_input - prompt', (done) ->
        kernel.execute_code
            code  : 'print(raw_input("prompt"))'
            all   : true
            stdin : (opts, cb) ->
                expect(opts).toEqual({ password: false, prompt: 'prompt' })
                cb(undefined, "cocalc")
            cb    : (err, v) ->
                if err
                    done(err)
                else
                    expect(common.output(v)).toEqual('cocalc\n')
                    done()

    it 'reading a password', (done) ->
        kernel.execute_code
            code  : 'import getpass; print(getpass.getpass("password?"))'
            all   : true
            stdin : (opts, cb) ->
                expect(opts).toEqual({ password: true, prompt: 'password?' })
                cb(undefined, "cocalc")
            cb    : (err, v) ->
                if err
                    done(err)
                else
                    expect(common.output(v)).toEqual('cocalc\n')
                    done()

    it 'closes the kernel', ->
        kernel.close()
        expect(kernel._state).toBe('closed')
        expect(kernel._kernel).toBe(undefined)
        expect(kernel._channels).toBe(undefined)

describe 'get input using the python3 kernel -- ', ->
    @timeout(30000)

    it 'do it', (done) ->
        kernel = common.kernel('python3')
        kernel.execute_code
            code  : 'print(input("prompt"))'
            all   : true
            stdin : (opts, cb) ->
                expect(opts).toEqual({ password: false, prompt: 'prompt' })
                cb(undefined, "cocalc")
            cb    : (err, v) ->
                kernel.close()
                if err
                    done(err)
                else
                    expect(common.output(v)).toEqual('cocalc\n')
                    done()

describe 'get input using the ir kernel -- ', ->
    @timeout(30000)

    it 'do it', (done) ->
        kernel = common.kernel('ir')
        kernel.execute_code
            code  : 'print(readline("prompt"))'
            all   : true
            stdin : (opts, cb) ->
                expect(opts).toEqual({ password: false, prompt: 'prompt' })
                cb(undefined, "cocalc")
            cb    : (err, v) ->
                kernel.close()
                if err
                    done(err)
                else
                    expect(common.output(v)).toEqual('[1] "cocalc"\n')
                    done()
