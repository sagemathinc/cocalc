
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
                    expect(v.slice(0, v.length-1)).toEqual([{"metadata":{},"content":{"execution_state":"busy"},"buffers":[],msg_type: 'status'},{"metadata":{},"content":{"execution_count":1,"code":"2+2"},"buffers":[],msg_type: 'execute_input'},{"metadata":{},"content":{"execution_count":1,"data":{"text/plain":"4"},"metadata":{}},"buffers":[], msg_type: 'execute_result'},{"metadata":{},"content":{"execution_state":"idle"},"buffers":[], msg_type: 'status'}])
                    done()

    it 'closes the kernel', ->
        kernel.close()
        expect(kernel._state).toBe('closed')
        expect(kernel._kernel).toBe(undefined)
        expect(kernel._channels).toBe(undefined)
