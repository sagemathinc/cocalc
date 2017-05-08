###
Test payload shell message.
###

expect  = require('expect')

common = require('./common')

misc = require('smc-util/misc')

describe 'create python2 kernel and do evals with and without payloads -- ', ->
    @timeout(5000)

    kernel = undefined
    it 'does an eval with no payload', (done) ->
        kernel = common.kernel('python2')
        kernel.execute_code
            code : '2+3'
            all  : true
            cb   : (err, v) ->
                if err
                    done(err)
                else
                    p = (x for x in v when x.payload?.length > 0)
                    #console.log 'p=', p
                    expect(p.length).toBe(0)
                    done()

    it 'does an eval with a payload (requires internet)', (done) ->
        kernel = common.kernel('python2')
        kernel.execute_code
            code : '%load https://matplotlib.org/mpl_examples/showcase/integral_demo.py'
            all  : true
            cb   : (err, v) ->
                if err
                    done(err)
                else
                    p = (x for x in v when x.content?.payload?.length > 0)
                    #console.log 'p=', p
                    s = '# %load https://matplotlib.org/mpl_examples/showcase/integral_demo.py\n"""\nPlot demonstrating'
                    expect(p.length).toBe(1)
                    expect(misc.startswith(p[0].content.payload[0].text,s)).toBe(true)
                    done()

    it 'closes the kernel', ->
        kernel.close()



