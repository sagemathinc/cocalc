
expect  = require('expect')

common = require('./common')

output_equals = (v, data) ->
    for x in v
        if x.content?.data?
            expect(x.content.data).toEqual(data)


describe 'compute 2+2 using the python2 kernel -- ', ->
    @timeout(5000)
    kernel = undefined

    it 'creates a python2 kernel', ->
        kernel = common.kernel('python2')

    it 'evaluate 2+7', (done) ->
        v = []
        kernel.execute_code
            code : '2+7'
            all  : true
            cb   : (err, v) ->
                if err
                    done(err)
                else
                    output_equals(v, {"text/plain":"9"})
                    done()

    it 'closes the kernel', ->
        kernel.close()
        expect(kernel._state).toBe('closed')
        expect(kernel._kernel).toBe(undefined)
        expect(kernel._channels).toBe(undefined)

    it 'verifies that executing code after closing the kernel gives an appropriate error', (done) ->
        kernel.execute_code
            code : '2+2'
            cb   : (err) ->
                expect(err).toBe('closed')
                done()

describe 'compute 2/3 using the python3 kernel -- ', ->
    @timeout(15000)
    kernel = undefined

    it 'creates a python3 kernel', ->
        kernel = common.kernel('python3')

    it 'evaluate 2/3', (done) ->
        v = []
        kernel.execute_code
            code : '2/3'
            all  : true
            cb   : (err, v) ->
                if err
                    done(err)
                else
                    output_equals(v, {"text/plain":"0.6666666666666666"})
                    done()

    it 'closes the kernel', ->
        kernel.close()
        expect(kernel._state).toBe('closed')
        expect(kernel._kernel).toBe(undefined)

describe 'it tries to start a kernel that does not exist -- ', ->
    kernel = undefined

    it 'creates a foobar kernel', ->
        kernel = common.kernel('foobar')
        expect(kernel._state).toBe('off')

    it 'then tries to use it, which will fail', (done) ->
        kernel.execute_code
            code : '2/3'
            all  : true
            cb   : (err, mesg) ->
                expect(mesg).toBe(undefined)
                expect(err).toBe('Error: No spec available for foobar')
                done()

describe 'calling the spawn method -- ', ->
    kernel = undefined
    @timeout(5000)

    it 'creates a python2 kernel', ->
        kernel = common.kernel('python2')
        expect(kernel._state).toBe('off')

    it 'observes state switches to running', (done) ->
        kernel.on 'state', (state) ->
            if state != 'running'
                return
            kernel.removeAllListeners()
            kernel.close()
            done()
        kernel.spawn (err) ->
            expect(err).toBe(undefined)

describe 'send signals to a kernel -- ', ->
    kernel = undefined
    @timeout(5000)

    it 'creates a python2 kernel', ->
        kernel = common.kernel('python2')

    it 'compute 2+2 to get things going', (done) ->
        kernel.execute_code(code:'2+2', all:true, cb:done)

    it 'start a long sleep running... and interrupt it', (done) ->
        kernel.execute_code
            code : 'import time; time.sleep(1000)'
            all  : true
            cb   : (err, data) ->
                expect(data?[2]?.content?.ename).toBe('KeyboardInterrupt')
                done(err)
        # send an interrupt signal to stop the above...
        setTimeout((->kernel.signal('SIGINT')), 250)

    it 'send a kill signal', (done) ->
        kernel.on 'state', (state) ->
            expect(state).toBe('closed')
            done()
        kernel.signal('SIGKILL')

describe 'start a kernel in a different directory -- ', ->
    kernel = undefined
    @timeout(5000)

    it 'creates a python2 kernel in current dir', (done) ->
        kernel = common.kernel('python2')
        kernel.execute_code
            code : 'import os; print(os.path.abspath("."))'
            all  : true
            cb   : (err, data) ->
                if err
                    done(err)
                    return
                path = data?[2]?.content?.text?.trim()
                if not path?
                    done("output failed")
                    return
                path = path.slice(path.length-7)
                expect(path).toBe('jupyter')
                done()

    it 'creates a python2 kernel with path test/a.ipynb2', (done) ->
        kernel = common.kernel('python2', 'test/a.ipynb2')
        kernel.execute_code
            code      : 'import os; print(os.path.abspath("."))'
            all       : true
            cb        : (err, data) ->
                if err
                    done(err)
                    return
                path = data?[2]?.content?.text?.trim()
                if not path?
                    done("output failed")
                    return
                path = path.slice(path.length-5)
                expect(path).toBe('/test')
                done(err)

describe 'use the key:value store -- ', ->
    kernel = undefined
    @timeout(5000)

    it 'creates a python2 kernel', ->
        kernel = common.kernel('python2')

    it 'tests setting the store', ->
        kernel.store.set({a:5, b:7}, {the:'value'})
        expect(kernel.store.get({b:7, a:5})).toEqual({the:'value'})

    it 'tests deleting from the store', ->
        kernel.store.delete({a:5, b:7})
        expect(kernel.store.get({b:7, a:5})).toBe(undefined)


