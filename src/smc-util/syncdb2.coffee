###############################################################################
#
# Part of CoCalc
# Copyright (C) 2017, Sagemath Inc.
# AGPLv3
#
###############################################################################

###
Synchronized document-oriented database.

###

underscore = require('underscore')

misc = require('./misc')
{defaults, required, hash_string, len} = misc

to_key = (x) -> JSON.stringify(x)

class exports.DBDoc
    constructor : (indexes=[]) ->
        @_records = []
        @_indexes = {}
        for col in indexes
            @_indexes[col] = {}

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
                for n of v
                    if not result[n]
                        delete result[n]
            else
                result = []
                for n of v
                    result[n] = true
        if not result?
            # where condition must have been empty -- matches everything
            result = []
            for n of @_records
                result[n] = true
        return result


    update: (opts) =>
        opts = defaults opts,
            set   : required
            where : required
        matches = @_select(opts.where)
        for n of matches
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
            return # we only change the FIRST match

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
            matches = index[to_key(record[field])] ?= []
            matches[n-1] = true
        return

    delete: (opts) =>
        opts = defaults opts,
            where : undefined  # if nothing given, will delete everything
        cnt = 0
        for n of @_select(opts.where)
            cnt += 1
            delete @_records[n]
            # remove n from every index
            for field, index of @_indexes
                for v, matches of index
                    if matches[n]?
                        delete matches[n]
        return cnt

    count: =>
        misc.len(@_records)

    select: (opts) =>
        opts = defaults opts,
            where : undefined
        return (@_records[n] for n of @_select(opts.where))

    select_one: (opts) =>
        opts = defaults opts,
            where : required
        for n of @_select(opts.where)
            return @_records[n]
        return