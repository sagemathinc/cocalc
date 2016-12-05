###
Similar to rethink.coffee... but built around PostgreSQL.

**
This code is currently NOT released under any license for use by anybody except SageMath, Inc.

(c) 2016 SageMath, Inc.
**
---

p = (require('./postgres')).pg()

---

NOTES:

  - Some of the methods in the main class below are also in rethink.coffee.
    Since rethink will likely get deleted once postgres is up and running,
    this doesn't concern me.
  - In the first pass, I'm not worrying about indexes.  This may hurt
    scalable performance.
###

fs           = require('fs')

async   = require('async')

misc_node  = require('smc-util-node/misc_node')
{defaults} = misc = require('smc-util/misc')
required   = defaults.required

exports.PUBLIC_PROJECT_COLUMNS = ['project_id',  'last_edited', 'title', 'description', 'deleted',  'created']
exports.PROJECT_COLUMNS = PROJECT_COLUMNS = ['users'].concat(exports.PUBLIC_PROJECT_COLUMNS)


###
Other misc functions
###

# Convert from info in the schema table to a pg type
# See https://www.postgresql.org/docs/devel/static/datatype.html
pg_type = (info, field) ->
    if typeof(info) == 'boolean'
        throw Error("pg_type: insufficient information to determine type (info=boolean)")
    if info.pg_type
        return info.pg_type
    if not info.type?
        throw Error("pg_type: insufficient information to determine type (pg_type and type both not given)")
    type = info.type.toLowerCase()
    switch type
        when 'uuid'
            return 'UUID'
        when 'timestamp'
            return 'TIMESTAMP'
        when 'string'
            return 'TEXT'
        when 'boolean'
            return 'BOOLEAN'
        when 'map'
            return 'JSONB'
        when 'integer'
            return 'INTEGER'
        when 'number', 'double', 'float'
            return 'DOUBLE PRECISION'
        when 'array'
            throw Error("pg_type: you must specify the array type explicitly")
        when 'buffer'
            return "BYTEA"
        else
            throw Error("pg_type: unknown type '#{type}'")

# Certain field names we used with RethinkDB
# aren't allowed without quoting in Postgres.
NEEDS_QUOTING =
    user : true
quote_field = (field) ->
    if NEEDS_QUOTING[field]
        return "\"#{field}\""
    return field

# Timestamp the given number of seconds **in the future**.
exports.expire_time = expire_time = (ttl) ->
    if ttl then new Date((new Date() - 0) + ttl*1000)

# Returns a function that takes as input the output of doing a SQL query.
# If there are no results, returns undefined.
# If there is exactly one result, what is returned depends on pattern:
#     'a_field' --> returns the value of this field in the result
# If more than one result, an error
exports.one_result = one_result = (pattern, cb) ->
    if not cb? and typeof(pattern) == 'function'
        cb = pattern
        pattern = undefined
    if not cb?
        return ->  # do nothing -- return function that ignores result
    return (err, result) ->
        if err
            cb(err)
            return
        if not result?.rows?
            cb()
            return
        switch result.rows.length
            when 0
                cb()
            when 1
                obj = misc.map_without_undefined(result.rows[0])
                if not pattern?
                    cb(undefined, obj)
                    return
                switch typeof(pattern)
                    when 'string'
                        x = obj[pattern]
                        if not x?  # null or undefined -- SQL returns null, but we want undefined
                            cb()
                        else
                            if obj.expire? and new Date() >= obj.expire
                                cb()
                            else
                                cb(undefined, x)
                    when 'object'
                        x = {}
                        for p in pattern
                            if obj[p]?
                                x[p] = obj[p]
                        cb(undefined, x)
                    else
                        cb("BUG: unknown pattern -- #{pattern}")
            else
                cb("more than one result")

exports.all_results = all_results = (pattern, cb) ->
    if not cb? and typeof(pattern) == 'function'
        cb = pattern
        pattern = undefined
    if not cb?
        return ->  # do nothing -- return function that ignores result
    return (err, result) ->
        if err
            cb(err)
        else
            rows = result.rows
            if not pattern?
                cb(undefined, rows)
            else if typeof(pattern) == 'string'
                cb(undefined, ((x[pattern] ? undefined) for x in rows))
            else
                cb("unsupported pattern type '#{typeof(pattern)}'")


exports.count_result = count_result = (cb) ->
    if not cb?
        return ->  # do nothing -- return function that ignores result
    return (err, result) ->
        if err
            cb(err)
        else
            cb(undefined, parseInt(result?.rows?[0]?.count))

# Add further functionality to PostgreSQL class -- must be at the bottom of this file.
# Each of the following calls extends the PostgreSQL class with further important functionality.
# Order matters.
for module in ['base', 'server-queries', 'blobs', 'synctable', 'user-queries']
    exports.PostgreSQL = require("./postgres-#{module}").PostgreSQL

exports.pg = (opts) ->
    return new exports.PostgreSQL(opts)


