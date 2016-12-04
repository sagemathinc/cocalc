###
Server side synchronized tables built on PostgreSQL.

**
This code is currently NOT released under any license for use by anybody except SageMath, Inc.

(c) 2016 SageMath, Inc.
**

###

EventEmitter = require('events')

#postgres = require('./postgres')
#
#class PostgreSQL extends postgres.PostgreSQL
#    # nothing yet
#
#postgres.PostgreSQL = PostgreSQL

class SyncTable extends EventEmitter
    constructor: (@_query, @_primary_key, @_db, @_idle_timeout_s, cb) ->
        throw Error("NotImplementedError")

    connect: (opts) =>
        throw Error("NotImplementedError")

    get: (key) =>
        throw Error("NotImplementedError")

    getIn: (x) =>
        throw Error("NotImplementedError")

    has: (key) =>
        throw Error("NotImplementedError")

    close: (keep_listeners) =>
        throw Error("NotImplementedError")

    wait: (opts) =>
        throw Error("NotImplementedError")
