###############################################################################
#
# CoCalc: Collaborative web-based calculation
# Copyright (C) 2017, Sagemath Inc.
# AGPLv3
#
###############################################################################
require('coffee-cache')

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

exports.db_doc = (indexed_fields) -> new DBDoc(indexed_fields)

indices = (v) ->
    (parseInt(n) for n of v)

first_index = (v) ->
    for n of v
        return parseInt(n)

class DBDoc
    constructor : (indexed_fields=[]) ->
        @_indexed_fields = misc.copy(indexed_fields)
        @_init()

    _init: =>
        @_records = []
        @_indexes = {}
        for field in @_indexed_fields
            @_indexes[field] = {}

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
    to_obj: () =>
        return misc.deep_copy(@_records)

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