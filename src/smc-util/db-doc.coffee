###############################################################################
#
# CoCalc: Collaborative web-based calculation
# Copyright (C) 2017, Sagemath Inc.
# AGPLv3
#
###############################################################################

###
Local document-oriented database with only two operations:

   - set(obj)    -- creates or modifies an object
   - delete(obj) -- delets all objects matching the spec

This is the foundation for a distributed synchronized database.
###

underscore = require('underscore')

misc = require('./misc')

# Well-defined JSON.stringify...
to_key = require('json-stable-stringify')

exports.db_doc = (primary_keys) ->
    if not misc.is_array(primary_keys)
        throw Error("primary_keys must be an array")
    new DBDoc(primary_keys)

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

    _parse: (obj) =>
        where = {}
        set   = {}
        if obj?
            for field, val of obj
                if @_indexes[field]?
                    where[field] = val
                else
                    set[field] = val
        return {where:where, set:set}

    set: (obj) =>
        if @_recording?
            @_recording.push(set:obj)
        {where, set} = @_parse(obj)
        matches = @_select(where)
        n = first_index(matches)
        if n?
            # edit the first existing record that matches
            record = @_records[n]
            for field, value of set
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
            for field, value of set
                record[field] = value
            for field, value of where
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

    delete: (where) =>
        # if where undefined, will delete everything
        if @_recording?
            @_recording.push(delete:where)
        if not where?
            # delete everything -- easy special case
            cnt = misc.keys(@_records).length
            @_init()
            return cnt
        remove = indices(@_select(where))
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

    get: (where) =>
        return (misc.deep_copy(@_records[n]) for n in indices(@_select(where)))

    get_one: (where) =>
        return misc.deep_copy(@_records[first_index(@_select(where))])

    is_equal: (other) =>
        if @ == other
            return true  # easy special case
        # harder... TODO: will need to make this faster...
        return underscore.isEqual(@to_obj(), other.to_obj())

    # Conversion to and from an array of records, which are normal Javascript objects
    to_obj: =>
        return (misc.deep_copy(record) for record in misc.values(@_records))

    from_obj: (obj) =>
        # Set the data
        @_records = misc.deep_copy(obj)
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

    to_str: =>
        return (misc.to_json(record) for record in @to_obj()).join('\n')

    from_str: (str) =>
        if str != ''
            obj = []
            for line in str.split('\n')
                try
                    obj.push(misc.from_json(line))
                catch e
                    console.warn("CORRUPT db-doc string: #{e} -- skipping '#{line}'")
            @from_obj(obj)
        else
            @from_obj([])

    # Record all the update actions that happen after this call
    start_recording: =>
        @_recording = []
        return

    # Stops a previously started recording, returning the result
    stop_recording: =>
        x = @_recording
        delete @_recording
        return x

    play_recording: (recording) =>
        for action in recording
            if action.set?
                @set(action.set)
            if action.delete?
                @delete(action.delete)

