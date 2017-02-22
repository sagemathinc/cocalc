###############################################################################
#
# CoCalc: Collaborative web-based calculation
# Copyright (C) 2017, Sagemath Inc.
# AGPLv3
#
###############################################################################

###
Very fast simple local document-oriented database with only two operations:

   - update
   - delete

This is the foundation for a distributed synchronized database...
###

misc = require('./misc')
{defaults, required} = misc

# Well-defined JSON.stringify...
to_key = require('json-stable-stringify')

exports.db_doc = (opts) ->
    opts = defaults opts,
        primary_keys : required
    if not misc.is_array(opts.primary_keys)
        throw Error("primary_keys must be an array")
    new DBDoc(opts.primary_keys)

indices = (v) ->
    (parseInt(n) for n of v)

first_index = (v) ->
    for n of v
        return parseInt(n)

class DBDoc
    constructor : (primary_keys=[]) ->
        @_primary_keys = misc.copy(primary_keys)
        @_init()

    _init: =>
        @_records = []
        @_indexes = {}
        for field in @_primary_keys
            @_indexes[field] = {}

    # Return copy of this DB, which can be safely modified
    # without impacting this DB.
    copy: =>
        db = new DBDoc()
        db._primary_keys = misc.copy(@_primary_keys)
        db._records = misc.deep_copy(@_records)
        db._indexes = misc.deep_copy(@_indexes)
        return db

    _select: (where) =>
        # Return sparse array with defined indexes the elts of @_records that
        # satisfy the where condition.  Do NOT mutate this.
        len = misc.len(where)
        for field, value of where
            index = @_indexes[field]
            if not index?
                throw Error("field '#{field}' must be indexed")
            v = index[to_key(value)]
            if len == 1
                return v  # no need to do further intersection
            if not v?
                return [] # no matches for this field - done
            if result?
                # intersect with what we've found so far via indexes.
                for n in indices(result)
                    if not v[n]?
                        delete result[n]
            else
                result = []
                for n in indices(v)
                    result[n] = true
        if not result?
            # where condition must have been empty -- matches everything
            result = []
            for n in indices(@_records)
                result[n] = true
        return result

    update: (opts) =>
        opts = defaults opts,
            set   : required
            where : undefined
        if @_recording?
            @_recording.push(update:opts)
        matches = @_select(opts.where)
        n = first_index(matches)
        if n?
            # edit the first existing record that matches
            record = @_records[n]
            for field, value of opts.set
                prev_key      = to_key(record[field])
                record[field] = value

                # Update index if there is one on the field
                index = @_indexes[field]
                if index?
                    cur_key = to_key(value)
                    index[cur_key] = n
                    if prev_key != cur_key
                        delete index[prev_key][n]
        else
            # The sparse array matches had nothing in it, so append a new record.
            record = {}
            for field, value of opts.set
                record[field] = value
            for field, value of opts.where
                record[field] = value
            @_records.push(record)
            n = @_records.length
            # update indexes
            for field, index of @_indexes
                val = record[field]
                if val?
                    matches = index[to_key(val)] ?= []
                    matches[n-1] = true
            return

    delete: (opts) =>
        opts = defaults opts,
            where : undefined  # if nothing given, will delete everything
        if @_recording?
            @_recording.push(delete:opts)
        if not opts.where?
            # delete everything -- easy special case
            cnt = misc.keys(@_records).length
            @_init()
            return cnt
        remove = indices(@_select(opts.where))
        if remove.length == misc.keys(@_records).length
            # actually deleting everything; again easy
            @_init()
            return remove.length
        # remove from every index
        for field, index of @_indexes
            for n in remove
                record = @_records[n]
                val = record[field]
                if val?
                    delete index[to_key(val)][n]
        # delete corresponding records
        cnt = 0
        for n in remove
            cnt += 1
            delete @_records[n]
        return cnt

    count: =>
        return indices(@_records).length

    select: (opts) =>
        opts = defaults opts,
            where : undefined
        return (misc.deep_copy(@_records[n]) for n in indices(@_select(opts.where)))

    select_one: (opts) =>
        opts = defaults opts,
            where : undefined
        return misc.deep_copy(@_records[first_index(@_select(opts.where))])

    # Conversion to and from an array of records, which are normal Javascript objects
    to_obj: =>
        return (misc.deep_copy(record) for record in misc.values(@_records))

    from_obj: (opts) =>
        opts = defaults opts,
            obj : required
        # Set the data
        @_records = misc.deep_copy(opts.obj)
        # Reset indexes
        for field of @_indexes
            @_indexes[field] = {}
        # Build indexes
        n = 0
        for record in @_records
            for field, index of @_indexes
                val = record[field]
                if val?
                    matches = index[to_key(val)] ?= []
                    matches[n] = true
            n += 1
        return

    # Record all the update actions that happen after this call
    start_recording: =>
        @_recording = []
        return

    # Stops a previously started recording, returning the result
    stop_recording: =>
        x = @_recording
        delete @_recording
        return x

    play_recording: (opts) =>
        opts = defaults opts,
            recording : required
        for action in opts.recording
            if action.update?
                @update(action.update)
            if action.delete?
                @delete(action.delete)


# Returns an apply_patch function for use in syncstring,
# which creates a DB with the given primary_keys in case
# the starting db is undefined.  NOTE that this apply_patch
# is horribly slow because it does NOT mutate the db in place.
# TODO: We'll fix that later.  For now the syncstring stuff
# would be horribly broken otherwise.   Fix ideas:
#   - use immutable.js
#   - write new version of relevant parts of syncstring
#     that works instead with patch_mutate.
exports.apply_patch = (patch, db) ->
    db = db.copy()
    db.start_recording()
    return [db, true]

# This is only used to go from @_last to live in syncstring.coffee...
exports.make_patch = (db0, db1) ->
    if db0 != db1
        throw Error("not implemented")
    patch = db1.stop_recording()
    db1.start_recording()
    return patch