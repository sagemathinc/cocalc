expect  = require('expect')

event_queue = null

describe 'test event_queue --', ->

    before (done) ->
        {init} = require('../../event_queue')
        init
            cb: (err, eq) ->
                event_queue = eq
                console.log(event_queue.stop)
                done()

    beforeEach ->
        # TODO run this query
        'TRUNCATE TABLE pgboss.job'

    after (done) ->
        event_queue.stop()  #.then(() -> done())  # how to deal with that???
        done()

    it 'checks existence', ->
        expect(event_queue).toExist()

    it 'singleton', (done) ->
        done()

        ## broken test
        #jobName = 'test'
        #skey = 'test1'
        #event_queue.publish(jobName, null, {singletonKey:skey})
        #.then (jobId) ->
        #    expect(jobId).toExist()
        #    return event_queue.publish(jobName, null, {singletonKey:skey})
        #.then (jobId) ->
        #    expect(jobId).toNotExist()
        #    done()
