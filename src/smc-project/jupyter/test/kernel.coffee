
expect  = require('expect')

common = require('./common')

describe 'compute 2+2 using the python2 kernel -- ', ->
    @timeout(20000)
    kernel = undefined

    it 'creates a python2 kernel', ->
        kernel = common.kernel('python2')

    it 'evaluate 2+2', (done) ->
        v = []
        kernel.execute_code
            code : '2+2'
            all  : true
            cb   : (err, v) ->
                if err
                    done(err)
                else
                    expect(v).toEqual([{"metadata":{},"content":{"execution_state":"busy"},"buffers":[]},{"metadata":{},"content":{"execution_count":1,"code":"2+2"},"buffers":[]},{"metadata":{},"content":{"execution_count":1,"data":{"text/plain":"4"},"metadata":{}},"buffers":[]},{"metadata":{},"content":{"execution_state":"idle"},"buffers":[]}])
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
    @timeout(20000)
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
                    expect(v).toEqual([{"metadata":{},"content":{"execution_state":"busy"},"buffers":[]},{"metadata":{},"content":{"execution_count":1,"code":"2/3"},"buffers":[]},{"metadata":{},"content":{"execution_count":1,"metadata":{},"data":{"text/plain":"0.6666666666666666"}},"buffers":[]},{"metadata":{},"content":{"execution_state":"idle"},"buffers":[]}])
                    done()

    it 'closes the kernel', ->
        kernel.close()
        expect(kernel._state).toBe('closed')
        expect(kernel._kernel).toBe(undefined)
