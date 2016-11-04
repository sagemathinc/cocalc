###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

async    = require('async')
sqlite3  = require('sqlite3')  # from https://github.com/mapbox/node-sqlite3
winston  = require('winston')

misc     = require('smc-util/misc')
{defaults, required} = misc

# Set the log level
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})




#########################################################################
#
# Interface to a SQlite Database.

#
# x={};require('sqlite').sqlite(filename:'/tmp/test.db',cb:(e,d)->console.log('done',e);x.d=d)
#
# cached and avoiding race conditions (should refactor this pattern!)
sqlite_cache = {}
sqlite_cache_cb = {}
exports.sqlite = (opts) ->
    opts = defaults opts,
        filename : required
        cb       : required
    if sqlite_cache[opts.filename]?
        opts.cb(undefined, sqlite_cache[opts.filename])
        return
    v = sqlite_cache_cb[opts.filename]
    if v?
        v.push(opts.cb)
        return
    else
        v = sqlite_cache_cb[opts.filename] = [opts.cb]
    new SQLite opts.filename, (err, db) ->
        delete sqlite_cache_cb[opts.filename]
        if not err
            sqlite_cache[opts.filename] = db
        for f in v
            f(err, db)

class SQLite
    constructor: (@filename, cb) ->
        @db = new sqlite3.Database @filename, (err) =>
            if err
                cb(err)
            else
                cb(undefined, @)

    ###

    x={};require('sqlite').sqlite(filename:'/tmp/test.db',cb:(e,d)->console.log('done',e);x.d=d;x.d.sql(query:'select * from projects',cb:console.log))

    ###
    sql: (opts) =>
        opts = defaults opts,
            query : required
            vals  : []
            cb    : undefined
        winston.debug("sql: query='#{opts.query}', vals=#{misc.to_json(opts.vals)}")
        @db.prepare(opts.query, opts.vals).all (err, rows) =>
            opts.cb?(err, rows)

    _format: (x, cond) =>
        if not cond or misc.len(cond) == 0
            return {query:"", vals:[]}
        q = []
        vals = []
        for k, v of cond
            q.push("#{k}=?")
            vals.push(v)
        return {query:" #{x} #{q.join(',')}", vals:vals}

    _where: (cond) => @_format('WHERE', cond)
    _set:   (cond) => @_format('SET', cond)

    # x={};require('sqlite').sqlite(filename:'/tmp/test.db',cb:(e,d)->console.log('done',e);x.d=d;x.d.count(table:'projects',cb:console.log))
    # x={};require('sqlite').sqlite(filename:'/tmp/test.db',cb:(e,d)->console.log('done',e);x.d=d;x.d.count(table:'projects',where:{project_id:'a418a066-6e44-464b-a0fe-934679b0cf97'},cb:console.log))
    count: (opts) =>
        opts = defaults opts,
            table  : required
            where  : undefined
            cb     : required
        if opts.where?
            w = @_where(opts.where)
            query = "SELECT count(*) FROM #{opts.table} #{w.query}"
            vals = w.vals
        else
            query = "SELECT count(*) FROM #{opts.table}"
            vals = []

        @sql
            query : query
            vals  : vals
            cb    : (err, result) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, result[0]['count(*)'])

    update: (opts) =>
        opts = defaults opts,
            table  : required
            where  : required
            set    : {}
            cb     : undefined
        count = undefined
        async.series([
            (cb) =>
                @count
                    table : opts.table
                    where : opts.where
                    cb    : (err, n) =>
                        count = n; cb(err)
            (cb) =>
                insert = () =>
                    w = @_where(opts.where)
                    s = @_set(opts.set)
                    @sql
                        query : "UPDATE #{opts.table} #{s.query} #{w.query}"
                        vals  : s.vals.concat(w.vals)
                        cb    : cb
                if count > 0
                    insert()
                else
                    columns     = []
                    vals        = []
                    vals_holder = []
                    for x in [opts.set, opts.where]
                        for k, v of x
                            columns.push("\"#{k}\"")
                            vals.push(v)
                            vals_holder.push('?')
                    @sql
                        query : "INSERT INTO #{opts.table} (#{columns.join(',')}) VALUES (#{vals_holder.join(',')})"
                        vals  : vals
                        cb    : (err) =>
                            if err
                                # We still have to try this and if it fails -- do to something else
                                # doing an insert after the count above, then do an update instead.
                                insert()
                            else
                                cb(err)
        ], (err) => opts.cb?(err))

    delete: (opts={}) ->
        opts = defaults opts,
            table : undefined
            where : {}
            cb    : undefined
        w = @_where(opts.where)
        @sql
            query : "DELETE FROM #{opts.table} #{w.query}"
            vals  : w.vals
            cb    : opts.cb

    select: (opts={}) =>
        opts = defaults opts,
            table   : required    # string -- the table to query
            columns : undefined   # list -- columns to extract
            where   : undefined   # object -- conditions to impose; undefined = return everything
            cb      : required    # callback(error, results)
        w = @_where(opts.where)
        if opts.columns?
            columns = opts.columns.join(',')
        else
            columns = '*'
        @sql
            query : "SELECT #{columns} FROM #{opts.table} #{w.query}"
            vals  : w.vals
            cb    : opts.cb
