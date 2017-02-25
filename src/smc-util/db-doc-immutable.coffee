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

immutable = require('immutable')

misc = require('./misc')

# Well-defined JSON.stringify...
json_stable = require('json-stable-stringify')
to_key = (s) ->
    if immutable.Map.isMap(s)
        s = s.toJS()
    return json_stable(s)

exports.db_doc = (primary_keys) ->
    if not misc.is_array(primary_keys)
        throw Error("primary_keys must be an array")
    return new DBDoc(primary_keys)

# Create a DBDoc from a plain javascript object
exports.from_obj = (obj) ->
    if not misc.is_array(obj)
        throw Error("obj must be an error")
    if obj.length == 0
        throw Error("obj must have length at least 1")
    # Set the data
    records    = immutable.fromJS(obj.slice(1))
    everything = immutable.Set(records.keys()).sort()
    return new DBDoc(obj[0], records, everything)

exports.from_str = (str) ->
    if str != ''
        obj = []
        for line in str.split('\n')
            try
                obj.push(misc.from_json(line))
            catch e
                console.warn("CORRUPT db-doc string: #{e} -- skipping '#{line}'")
        return exports.from_obj(obj)
    else
        return exports.from_obj([])

class DBDoc
    constructor : (@_primary_keys, @_records, @_everything, @_indexes) ->
        if misc.is_array(@_primary_keys)
            p = {}
            for field in @_primary_keys
                p[field] = true
            @_primary_keys = p
        else if not misc.is_object(@_primary_keys)
            throw Error("primary_keys must be a map or array")
        # list of records -- each is assumed to be an immutable.Map.
        @_records    ?= immutable.List()
        # sorted set of i such that @_records.get(i) is defined.
        @_everything ?= immutable.Set((n for n in [0...@_records.size] when @_records.get(n)?)).sort()
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

    _select: (where) =>
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
                where[field] = val
            else
                set[field] = val
        return {where:where, set:set}

    set: (obj) =>
        {where, set} = @_parse(obj)
        matches = @_select(where)
        n = matches?.first()
        if n?
            # edit the first existing record that matches
            before = record = @_records.get(n)
            for field, value of set
                record = record.set(field, immutable.fromJS(value))
            if not before.equals(record)
                # actual change so update; doesn't change anything involving indexes.
                return new DBDoc(@_primary_keys, @_records.set(n, record), @_everything, @_indexes)
        else
            # The sparse array matches had nothing in it, so append a new record.
            records = @_records.push(immutable.fromJS(obj))
            n = records.size - 1
            everything = @_everything.add(n)
            # update indexes
            indexes = @_indexes
            for field of @_primary_keys
                val = obj[field]
                if val?
                    index = indexes.get(field) ? immutable.Map()
                    k = to_key(val)
                    matches = index.get(k)
                    if matches?
                        matches = matches.add(n).sort()
                    else
                        matches = immutable.Set([n])
                    indexes = indexes.set(field, index.set(k, matches))
            return new DBDoc(@_primary_keys, records, everything, indexes)

    delete: (where) =>
        # if where undefined, will delete everything
        if @_everything.size == 0
            # no-op -- no data so deleting is trivial
            return @
        if not where?
            # delete everything -- easy special case
            return new DBDoc(@_primary_keys)
        remove = @_select(where)
        if remove.size == @_everything.size
            # actually deleting everything; again easy
            return new DBDoc(@_primary_keys)

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
            records = records.set(n, undefined)

        everything = @_everything.subtract(remove)

        return new DBDoc(@_primary_keys, records, everything, indexes)

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

    is_equal: (other) =>
        if @_records == other._records
            return true
        # TODO: does this really work -- would be amazing...
        return immutable.Set(@_records).equals(immutable.Set(other._records))

    # Conversion to and from an array of records, which is the primary key list followed by the normal Javascript objects
    to_obj: =>
        v = @get().toJS()
        v.unshift(misc.keys(@_primary_keys))
        return v

    to_str: =>
        return (misc.to_json(x) for x in @to_obj()).join('\n')
