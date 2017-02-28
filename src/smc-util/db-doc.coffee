###############################################################################
#
# CoCalc: Collaborative web-based calculation
# Copyright (C) 2017, Sagemath Inc.
# AGPLv3
#
###############################################################################

###
Local document-oriented database:

   - set(obj)    -- creates or modifies an object
   - delete(obj) -- delets all objects matching the spec
   - get(where)  -- get list of 0 or more matching objects
   - get_one(where) -- get at most one matching object

This is the foundation for a distributed synchronized database.

Based on immutable.js, and very similar API to db-doc.
###

immutable  = require('immutable')
underscore = require('underscore')

syncstring = require('./syncstring')

misc       = require('./misc')

{required, defaults} = misc

{EventEmitter} = require('events')

# Well-defined JSON.stringify...
json_stable = require('json-stable-stringify')
to_key = (s) ->
    if immutable.Map.isMap(s)
        s = s.toJS()
    return json_stable(s)

exports.db_doc = (opts) ->
    opts = defaults opts,
        primary_keys : required
        string_cols  : []
    if not misc.is_array(opts.primary_keys)
        throw Error("primary_keys must be an array")
    if not misc.is_array(opts.string_cols)
        throw Error("_string_cols must be an array")
    return new DBDoc(opts.primary_keys, opts.string_cols)

# Create a DBDoc from a plain javascript object
exports.from_obj = (opts) ->
    opts = defaults opts,
        obj          : required
        primary_keys : required
        string_cols  : []
    if not misc.is_array(opts.obj)
        throw Error("obj must be an array")
    # Set the data
    records    = immutable.fromJS(opts.obj)
    return new DBDoc(opts.primary_keys, opts.string_cols, records)

exports.from_str = (opts) ->
    opts = defaults opts,
        str          : required
        primary_keys : required
        string_cols  : []
    if not misc.is_string(opts.str)
        throw Error("obj must be a string")
    obj = []
    for line in opts.str.split('\n')
        if line.length > 0
            try
                obj.push(misc.from_json(line))
            catch e
                console.warn("CORRUPT db-doc string: #{e} -- skipping '#{line}'")
    return exports.from_obj(obj:obj, primary_keys:opts.primary_keys, string_cols:opts.string_cols)

class DBDoc
    constructor: (@_primary_keys, @_string_cols, @_records, @_everything, @_indexes, @_changes) ->
        @_primary_keys = @_process_cols(@_primary_keys)
        @_string_cols  = @_process_cols(@_string_cols)
        # list of records -- each is assumed to be an immutable.Map.
        @_records     ?= immutable.List()
        # sorted set of i such that @_records.get(i) is defined.
        @_everything  ?= immutable.Set((n for n in [0...@_records.size] when @_records.get(n)?)).sort()
        if not @_indexes?
            # Build indexes
            @_indexes = immutable.Map()  # from field to Map
            for field of @_primary_keys
                @_indexes = @_indexes.set(field, immutable.Map())
            n = 0
            @_records.map (record, n) =>
                @_indexes.map (index, field) =>
                    val = record.get(field)
                    if val?
                        k = to_key(val)
                        matches = index.get(k)
                        if matches?
                            matches = matches.add(n).sort()
                        else
                            matches = immutable.Set([n])
                        @_indexes = @_indexes.set(field, index.set(k, matches))
                    return
                return
        @size = @_everything.size
        @_changes ?= immutable.Set()

    reset_changes: =>
        @_changes = immutable.Set()

    changes: =>
        return @_changes

    _process_cols: (v) =>
        if misc.is_array(v)
            p = {}
            for field in v
                p[field] = true
            return p
        else if not misc.is_object(v)
            throw Error("primary_keys must be a map or array")
        return v

    _select: (where) =>
        if immutable.Map.isMap(where)
            where = where.toJS()
        # Return sparse array with defined indexes the elts of @_records that
        # satisfy the where condition.
        len = misc.len(where)
        result = undefined
        for field, value of where
            index = @_indexes.get(field)
            if not index?
                throw Error("field '#{field}' must be a primary key")
            # v is an immutable.js set or undefined
            v = index.get(to_key(value))
            if len == 1
                return v  # no need to do further intersection
            if not v?
                return immutable.Set() # no matches for this field - done
            if result?
                # intersect with what we've found so far via indexes.
                result = result.intersect(v)
            else
                result = v
        if not result?
            # where condition must have been empty -- matches everything
            return @_everything
        else
            return result

    # Used internally for determining the set/where parts of an object.
    _parse: (obj) =>
        if immutable.Map.isMap(obj)
            obj = obj.toJS() # TODO?
        if not misc.is_object(obj)
            throw Error("obj must be a Javascript object")
        where = {}
        set   = {}
        for field, val of obj
            if @_primary_keys[field]?
                if val?
                    where[field] = val
            else
                set[field] = val
        return {where:where, set:set}

    set: (obj) =>
        if misc.is_array(obj)
            z = @
            for x in obj
                z = z.set(x)
            return z
        {where, set} = @_parse(obj)
        ## console.log("set #{misc.to_json(set)}, #{misc.to_json(where)}")
        matches = @_select(where)
        changes = @_changes
        n = matches?.first()
        if n?
            # edit the first existing record that matches
            before = record = @_records.get(n)
            for field, value of set
                if value == null  # null = how to delete fields
                    record = record.delete(field)
                else
                    if @_string_cols[field] and misc.is_array(value)
                        # a patch
                        record = record.set(field, syncstring.apply_patch(value, before.get(field) ? '')[0])
                    else
                        record = record.set(field, immutable.fromJS(value))
            if not before.equals(record)
                # actual change so update; doesn't change anything involving indexes.
                changes = changes.add(record.filter((v,k)=>@_primary_keys[k]))
                return new DBDoc(@_primary_keys, @_string_cols, @_records.set(n, record), @_everything, @_indexes, changes)
            else
                return @
        else
            # The sparse array matches had nothing in it, so append a new record.
            for field of @_string_cols
                if obj[field]? and misc.is_array(obj[field])
                    # it's a patch -- but there is nothing to patch, so discard this field
                    obj = misc.copy_without(obj, field)
            record = immutable.fromJS(obj)
            changes = changes.add(record.filter((v,k)=>@_primary_keys[k]))
            records = @_records.push(record)
            n = records.size - 1
            everything = @_everything.add(n)
            # update indexes
            indexes = @_indexes
            for field of @_primary_keys
                val = obj[field]
                if val? and val != null
                    index = indexes.get(field) ? immutable.Map()
                    k = to_key(val)
                    matches = index.get(k)
                    if matches?
                        matches = matches.add(n).sort()
                    else
                        matches = immutable.Set([n])
                    indexes = indexes.set(field, index.set(k, matches))
            return new DBDoc(@_primary_keys, @_string_cols, records, everything, indexes, changes)

    delete: (where) =>
        if misc.is_array(where)
            z = @
            for x in where
                z = z.delete(x)
            return z
        # if where undefined, will delete everything
        if @_everything.size == 0
            # no-op -- no data so deleting is trivial
            return @
        changes = @_changes
        remove = @_select(where)
        if remove.size == @_everything.size
            # actually deleting everything; easy special cases
            changes = changes.union(@_records.filter((record)=>record?).map((record) => record.filter((v,k)=>@_primary_keys[k])))
            return new DBDoc(@_primary_keys, @_string_cols, undefined, undefined, undefined, changes)

        # remove matches from every index
        indexes = @_indexes
        for field of @_primary_keys
            index = indexes.get(field)
            if not index?
                continue
            remove.map (n) =>
                record = @_records.get(n)
                val = record.get(field)
                if val?
                    k = to_key(val)
                    matches = index.get(k).delete(n)
                    if matches.size == 0
                        index = index.delete(k)
                    else
                        index = index.set(k, matches)
                    indexes = indexes.set(field, index)
                return

        # delete corresponding records
        records = @_records
        remove.map (n) =>
            changes = changes.add(records.get(n).filter((v,k)=>@_primary_keys[k]))
            records = records.set(n, undefined)

        everything = @_everything.subtract(remove)

        return new DBDoc(@_primary_keys, @_string_cols, records, everything, indexes, changes)

    # Returns immutable list of all matches
    get: (where) =>
        matches = @_select(where)
        if not matches?
            return immutable.List()
        return @_records.filter((x,n)->matches.includes(n))

    # Returns the first match, or undefined if there are no matches
    get_one: (where) =>
        matches = @_select(where)
        if not matches?
            return
        return @_records.get(matches.first())

    equals: (other) =>
        if @_records == other._records
            return true
        if @size != other.size
            return false
        return immutable.Set(@_records).add(undefined).equals(immutable.Set(other._records).add(undefined))

    # Conversion to and from an array of records, which is the primary key list followed by the normal Javascript objects
    to_obj: =>
        return @get().toJS()

    to_str: =>
        return (misc.to_json(x) for x in @to_obj()).join('\n')

    # x = javascript object
    _primary_key_part: (x) =>
        where = {}
        for k, v of x
            if @_primary_keys[k]
                where[k] = v
        return where

    make_patch: (other) =>
        if other.size == 0
            # Special case -- delete everything
            return [-1,[{}]]

        t0 = immutable.Set(@_records)
        t1 = immutable.Set(other._records)
        # Remove the common intersection -- nothing going on there.
        # Doing this greatly reduces the complexity in the common case in which little has changed
        common = t0.intersect(t1).add(undefined)
        t0 = t0.subtract(common)
        t1 = t1.subtract(common)

        # Easy very common special cases
        if t0.size == 0
            # Special case: t0 is empty -- insert all the records.
            return [1, t1.toJS()]
        if t1.size == 0
            # Special case: t1 is empty -- bunch of deletes
            v = []
            t0.map (x) =>
                v.push(@_primary_key_part(x.toJS()))
                return
            return [-1, v]

        # compute the key parts of t0 and t1 as sets
        k0 = t0.map((x) => x.filter((v,k)=>@_primary_keys[k]))  # means -- set got from t0 by taking only the primary_key columns
        k1 = t1.map((x) => x.filter((v,k)=>@_primary_keys[k]))

        add = []
        remove = undefined

        # Deletes: everything in k0 that is not in k1
        deletes = k0.subtract(k1)
        if deletes.size > 0
            remove = deletes.toJS()

        # Inserts: everything in k1 that is not in k0
        inserts = k1.subtract(k0)
        if inserts.size > 0
            inserts.map (k) =>
                add.push(other.get_one(k.toJS()).toJS())
                return

        # Everything in k1 that is also in k0 -- these must have all changed
        changed = k1.intersect(k0)
        if changed.size > 0
            changed.map (k) =>
                obj  = k.toJS()
                obj0 = @_primary_key_part(obj)
                from = @get_one(obj0).toJS()
                to   = other.get_one(obj0).toJS()
                # undefined for each key of from not in to
                for k of from
                    if not to[k]?
                        obj[k] = null
                # explicitly set each key of to that is different than corresponding key of from
                for k, v of to
                    if not underscore.isEqual(from[k], v)
                        if @_string_cols[k] and from[k]? and v?
                            # make a string patch
                            obj[k] = syncstring.make_patch(from[k], v)
                        else
                            obj[k] = v
                add.push(obj)
                return

        patch = []
        if remove?
            patch.push(-1)
            patch.push(remove)
        if add.length > 0
            patch.push(1)
            patch.push(add)

        return patch

    apply_patch: (patch) =>
        i = 0
        db = @
        while i < patch.length
            if patch[i] == -1
                db = db.delete(patch[i+1])
            else if patch[i] == 1
                db = db.set(patch[i+1])
            i += 2
        return db



class Doc
    constructor: (@_db) ->
        if not @_db?
            throw Error("@_db must be defined")

    to_str: =>
        return @_db.to_str()

    is_equal: (other) =>
        return @_db.equals(other._db)

    apply_patch: (patch) =>
        #console.log("apply_patch")
        db = new Doc(@_db.apply_patch(patch))

    make_patch: (other) =>
        return @_db.make_patch(other._db)

    changes: =>
        return @_db.changes()

    reset_changes: =>
        @_db.reset_changes()
        return

class SyncDoc extends syncstring.SyncDoc
    constructor: (opts) ->
        opts = defaults opts,
            client            : required
            project_id        : undefined
            path              : undefined
            save_interval     : undefined
            file_use_interval : undefined
            primary_keys      : required
            string_cols       : []

        from_str = (str) ->
            db = exports.from_str
                str          : str
                primary_keys : opts.primary_keys
                string_cols  : opts.string_cols
            return new Doc(db)

        super
            string_id         : opts.id
            client            : opts.client
            project_id        : opts.project_id
            path              : opts.path
            save_interval     : opts.save_interval
            file_use_interval : opts.file_use_interval
            cursors           : false
            from_str          : from_str
            doctype           : {type:'db', opts:{primary_keys: opts.primary_keys, string_cols: opts.string_cols}}

class exports.SyncDB extends EventEmitter
    constructor: (opts) ->
        @_path = opts.path
        if opts.throttle
            # console.log("throttling on_change #{opts.throttle}")
            @_on_change = underscore.throttle(@_on_change, opts.throttle)
            delete opts.throttle
        @_doc = new SyncDoc(opts)
        @_doc.on('change', @_on_change)
        @_doc.on('before-change', => @emit('before-change'))
        @_doc.on('sync', => @emit('sync'))
        @setMaxListeners(100)

    _check: =>
        if not @_doc?
            throw Error("SyncDB('#{@_path}') is closed")

    has_unsaved_changes: =>
        @_check()
        return @_doc.has_unsaved_changes()

    has_uncommitted_changes: =>
        @_check()
        return @_doc.has_uncommitted_changes()

    is_read_only: =>
        @_check()
        return @_doc.get_read_only()

    _on_change: () =>
        # console.log '_on_change'
        changes = @_doc.get().changes()
        @_doc.get().reset_changes()
        if changes.size > 0  # something actually probably changed
            @emit('change', changes)

    close: () =>
        if not @_doc?
            return
        @removeAllListeners()
        @_doc?.removeListener('change', @_on_change)
        @_doc?.close()
        delete @_doc

    is_closed: =>
        return not @_doc?

    save: (cb) =>
        @_check()
        @_doc?.save_to_disk(cb)
        return

    # change (or create) exactly *one* database entry that matches
    # the given where criterion.
    set: (obj) =>
        #console.log('set', obj)
        @_check()
        @_doc.set(new Doc(@_doc.get()._db.set(obj)))
        @_doc.save()   # always saves to backend after change
        return

    get: (where, time) =>
        #console.log('get', where)
        @_check()
        if time?
            d = @_doc.version(time)
        else
            d = @_doc.get()
        return d._db.get(where)

    get_one: (where, time) =>
        #console.log('get_one', where)
        @_check()
        if time?
            d = @_doc.version(time)
        else
            d = @_doc.get()
        return d._db.get_one(where)

    versions: =>
        @_check()
        return @_doc.versions()

    # delete everything that matches the given criterion; returns number of deleted items
    delete: (where) =>
        @_check()
        @_doc.set(new Doc(@_doc.get()._db.delete(where)))
        @_doc.save()   # always saves to backend after change
        return

    count: =>
        @_check()
        return @_doc.get()._db.size

    undo: =>
        @_check()
        @_doc.set(@_doc.get().undo())
        @_doc.save()
        return

    redo: =>
        @_check()
        @_doc.set(@_doc.get().redo())
        @_doc.save()
        return

    revert: (version) =>
        @_check()
        @_doc.set(@_doc.version(version))
        @_doc.save()
        return

