###
TESTING of server-side synctable

**
This code is currently NOT released under any license for use by anybody except SageMath, Inc.

(c) 2016 SageMath, Inc.
**

###

async  = require('async')
expect = require('expect')

pgtest   = require('./pgtest')
db       = undefined
setup    = (cb) -> (pgtest.setup (err) -> db=pgtest.db; cb(err))
teardown = pgtest.teardown
{create_accounts, create_projects, changefeed_series} = pgtest
misc = require('smc-util/misc')

describe 'test storage_server synctable', ->
    before(setup)
    after(teardown)

    synctable = undefined
    it 'creates a synctable on the storage_servers', (done) ->
        db.synctable
            table : 'storage_servers'
            cb    : (err, x) ->
                synctable = x; done(err)

    it 'adds a storage server and notices this via wait', (done) ->
        synctable.wait
            until   : (x) ->
                return x.get().size > 0
            timeout : 2
            cb      : done
        # Now do the write, which will trigger the above wait to call done.
        db._query
            query : "INSERT INTO storage_servers"
            values : {host:'storage0'}

    it 'adds another storage server and notices this via change notification', (done) ->
        new_host = 'storage1'
        f = (host) ->
            synctable.removeListener('change', f)
            if host == new_host
                done()
            else
                done("wrong host - #{host}")
        synctable.on 'change', f
        db._query
            query : "INSERT INTO storage_servers"
            values : {host:new_host}
            cb : (err) -> expect(err).toEqual(undefined)

    it 'adds 2 storage servers and notices when the last is added', (done) ->
        hosts = ['storage2', 'storage3']
        f = (host) ->
            if host == hosts[hosts.length - 1]
                synctable.removeListener('change', f)
                done()
        synctable.on('change', f)
        db._query
            query  : "INSERT INTO storage_servers"
            values : ({host:h} for h in hosts)
            cb : (err) -> expect(err).toEqual(undefined)

