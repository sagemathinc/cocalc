###############################################################################
#
# CoCalc: Collaborative web-based calculation
# Copyright (C) 2017, Sagemath Inc.
# AGPLv3
#
###############################################################################

###
Efficient local document-oriented database with complete history
recording backed by a backend database.

   - set(obj)    -- creates or modifies an object
   - delete(obj) -- delets all objects matching the spec
   - get(where)  -- get immutable list of 0 or more matching objects
   - get_one(where) -- get one matching object or undefined

This is the foundation for a distributed synchronized database.

DO **NOT** store anything that can't be converted from/to pure JSON.
In particular, do *NOT* store Date objects -- they will come back as
ISO strings and not be parsed.  See https://github.com/sagemathinc/cocalc/issues/1771
Instead use ms since epoch (or .toISOString()) for dates.  Please!!
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

# obj and change are both immutable.js Maps.  Do the following:
#  - for each value of change that is null or undefined, we delete that key from obj
#  - we set the other vals of obj, accordingly.
# So this is a shallow merge with the ability to *delete* keys.
merge_set = (obj, change) ->
    ##return obj.merge(change).filter((v,k) => v != null)
    change.map (v, k) ->
        if v == null or not v?
            obj = obj.delete(k)
        else
            obj = obj.set(k, v)
        return
    return obj

# Create an object change such that merge_set(obj1, change) produces obj2.
# Thus for each key, value1 of obj1 and key, value2 of obj2:
#  If value1 is the same as value2, do nothing.
#  If value1 exists but value2 does not, do change[key] = null
#  If value2 exists but value1 does not, do change[key] = value2
map_merge_patch = (obj1, obj2) ->
    change = {}
    for key, val1 of obj1
        val2 = obj2[key]
        if underscore.isEqual(val1, val2)
            # nothing to do
        else if not val2?
            change[key] = null
        else
            change[key] = val2
    for key, val2 of obj2
        if obj1[key]?
            continue
        change[key] = val2
    return change

nonnull_cols = (f) ->
    return f.filter((v,k) => v != null)

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
        if not @_changes?
            @reset_changes()

    reset_changes: =>
        @_changes = {changes: immutable.Set(), from_db:@}

    # Returns object {changes: an immutable set of primary keys, from_db: db object where change tracking started}
    changes: =>
        return @_changes

    # Given an immutable map f, return its restriction to the primary keys
    _primary_key_cols: (f) =>
        return f.filter((v, k) => @_primary_keys[k])

    # Given an immutable map f, return its restriction to only keys that
    # have non-null defined values.
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
        # Return immutable set with defined indexes the elts of @_records that
        # satisfy the where condition.
        len = misc.len(where)
        result = undefined
        for field, value of where
            index = @_indexes.get(field)
            if not index?
                throw Error("field '#{field}' must be a primary key")
            # v is an immutable.js set or undefined
            v = index.get(to_key(value))  # v may be undefined here, so important to do the v? check first!
            if not v?
                return immutable.Set() # no matches for this field - done
            if len == 1
                # no need to do further intersection
                return v
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
        if immutable.Map.isMap(obj)  # it is very clean/convenient to allow this
            obj = obj.toJS()
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
        return {where:where, set:set, obj:obj}  # return obj, in case had to convert from immutable

    set: (obj) =>
        if misc.is_array(obj)
            z = @
            for x in obj
                z = z.set(x)
            return z
        {where, set, obj} = @_parse(obj)
        # console.log("set #{misc.to_json(set)}, #{misc.to_json(where)}")
        matches = @_select(where)
        {changes} = @_changes
        n = matches?.first()
        # TODO: very natural optimization would be be to fully support and use obj being immutable
        if n?
            # edit the first existing record that matches
            before = record = @_records.get(n)
            for field, value of set
                if value == null  # null = how to delete fields
                    record = record.delete(field)
                else
                    if @_string_cols[field] and misc.is_array(value)
                        # special case: a string patch
                        record = record.set(field, syncstring.apply_patch(value, before.get(field) ? '')[0])
                    else
                        cur    = record.get(field)
                        change = immutable.fromJS(value)
                        if immutable.Map.isMap(cur) and immutable.Map.isMap(change)
                            new_val = merge_set(cur, change)
                        else
                            new_val = change
                        record = record.set(field, new_val)

            if not before.equals(record)
                # there was an actual change, so update; doesn't change anything involving indexes.
                changes = changes.add(@_primary_key_cols(record))
                return new DBDoc(@_primary_keys, @_string_cols, @_records.set(n, record), @_everything, @_indexes, {changes:changes, from_db:@_changes.from_db})
            else
                return @
        else
            # The sparse array matches had nothing in it, so append a new record.
            for field of @_string_cols
                if obj[field]? and misc.is_array(obj[field])
                    # it's a patch -- but there is nothing to patch, so discard this field
                    obj = misc.copy_without(obj, field)
            record  = nonnull_cols(immutable.fromJS(obj))  # remove null columns (indicate delete)
            changes = changes.add(@_primary_key_cols(record))
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
            return new DBDoc(@_primary_keys, @_string_cols, records, everything, indexes, {changes:changes, from_db:@_changes.from_db})

    delete: (where) =>
        if misc.is_array(where)
            z = @
            for x in where
                z = z.delete(x)
            return z
        # console.log("delete #{misc.to_json(where)}")
        # if where undefined, will delete everything
        if @_everything.size == 0
            # no-op -- no data so deleting is trivial
            return @
        {changes} = @_changes
        remove = @_select(where)
        if remove.size == @_everything.size
            # actually deleting everything; easy special cases
            changes = changes.union(@_records.filter((record)=>record?).map(@_primary_key_cols))
            return new DBDoc(@_primary_keys, @_string_cols, undefined, undefined, undefined, {changes:changes, from_db:@_changes.from_db})

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

        # delete corresponding records (actually set to undefined)
        records = @_records
        remove.map (n) =>
            changes = changes.add(@_primary_key_cols(records.get(n)))
            records = records.set(n, undefined)

        everything = @_everything.subtract(remove)

        return new DBDoc(@_primary_keys, @_string_cols, records, everything, indexes, {changes:changes, from_db:@_changes.from_db})

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
        if @_to_str_cache?  # save to cache since this is an immutable object
            return @_to_str_cache
        v = (misc.to_json(x) for x in @to_obj())
        # NOTE: It is *VERY* important to sort this!  Otherwise, the hash of this document, which is used by
        # syncstring, isn't stable in terms of the value of the document.  This can in theory
        # cause massive trouble with file saves, e.g., of jupyter notebooks, courses, etc. (They save fine, but
        # they appear not to for the user...).
        v.sort()
        return @_to_str_cache = v.join('\n')

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
        # means -- set got from t0 by taking only the primary_key columns
        k0 = t0.map(@_primary_key_cols)
        k1 = t1.map(@_primary_key_cols)

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
                            # A string patch
                            obj[k] = syncstring.make_patch(from[k], v)
                        else if misc.is_object(from[k]) and misc.is_object(v)
                            # Changing from one map to another, where they are not equal -- can use
                            # a merge to make this more efficient.  This is an important optimization,
                            # to avoid making patches HUGE.
                            obj[k] = map_merge_patch(from[k], v)
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

    # Return immutable set of primary keys of records that change in going from @ to other.
    changed_keys: (other) =>
        if @_records == other?._records   # identical
            return immutable.Set()
        t0 = immutable.Set(@_records).filter((x) -> x?)  # defined records
        if not other?
            return t0.map(@_primary_key_cols)

        t1 = immutable.Set(other._records).filter((x) -> x?)

        # Remove the common intersection -- nothing going on there.
        # Doing this greatly reduces the complexity in the common case in which little has changed
        common = t0.intersect(t1)
        t0 = t0.subtract(common)
        t1 = t1.subtract(common)

        # compute the key parts of t0 and t1 as sets
        k0 = t0.map(@_primary_key_cols)
        k1 = t1.map(@_primary_key_cols)
        return k0.union(k1)

class Doc
    constructor: (@_db) ->
        if not @_db?
            throw Error("@_db must be defined")

    to_str: =>
        return @_db.to_str()

    is_equal: (other) =>
        if not other?
            # Definitely not equal if not defined -- this should never get called, but other bugs could lead
            # here, so we handle it sensibly here at least.  See, e.g., https://github.com/sagemathinc/cocalc/issues/2586
            return false
        return @_db.equals(other._db)

    apply_patch: (patch) =>
        #console.log("apply_patch")
        return new Doc(@_db.apply_patch(patch))

    make_patch: (other) =>
        if not @_db? or not other?._db?
            # not initialized or closed, etc., -- undefined means done.
            return
        return @_db.make_patch(other._db)

    changes: =>
        return @_db.changes()

    reset_changes: =>
        @_db.reset_changes()
        return

    get: (where) =>
        return @_db?.get(where)

    get_one: (where) =>
        return @_db?.get_one(where)

class SyncDoc extends syncstring.SyncDoc
    constructor: (opts) ->
        opts = defaults opts,
            client            : required
            project_id        : undefined
            path              : undefined
            save_interval     : undefined
            patch_interval    : undefined
            file_use_interval : undefined
            cursors           : false
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
            patch_interval    : opts.patch_interval
            file_use_interval : opts.file_use_interval
            cursors           : opts.cursors
            from_str          : from_str
            doctype           :
                type         : 'db'
                patch_format : 1
                opts         :
                    primary_keys : opts.primary_keys
                    string_cols  : opts.string_cols

# TODO: obviously I should rewrite this so SyncDB just derives from SyncDoc.  I didn't realize
# otherwise I would have to proxy all the methods.
class exports.SyncDB extends EventEmitter
    constructor: (opts) ->
        super()
        @_path = opts.path
        if opts.change_throttle
            # console.log("throttling on_change #{opts.throttle}")
            @_on_change = underscore.throttle(@_on_change, opts.change_throttle)
        delete opts.change_throttle
        @_doc = new SyncDoc(opts)
        # Ensure that we always emit first change event, even if it is [] (in case of empty syncdb);
        # clients depend on this to know when the syncdb has been properly loaded.
        @_first_change_event = true
        @_doc.on('change', @_on_change)
        @_doc.on('metadata-change', => @emit('metadata-change'))
        @_doc.on('before-change', => @emit('before-change'))
        @_doc.on('sync', => @emit('sync'))
        @_doc.on('load-time-estimate', (args...) => @emit('load-time-estimate', args...))
        if opts.cursors
            @_doc.on('cursor_activity', (args...) => @emit('cursor_activity', args...))
        @_doc.on('connected', => @emit('connected'))
        @_doc.on('init', (err) => @emit('init', err))
        @_doc.on('save_to_disk_project', (err) => @emit('save_to_disk_project', err))  # only emitted on the backend/project!
        @setMaxListeners(100)

    wait: (opts) =>
        @_doc.wait
            timeout : opts.timeout
            until : => return opts.until(@)
            cb    : opts.cb

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

    _on_change: =>
        if not @_doc?
            # This **can** happen because @_on_change is actually throttled, so
            # definitely will sometimes get called one more time,
            # even after this object is closed. (see the constructor above).
            # Not rebroadcasting such change events is fine, since the object
            # is already closed and nobody is listening.
            # See https://github.com/sagemathinc/cocalc/issues/1829
            return
        db = @_doc.get_doc()._db
        if not @_last_db?
            # first time ever -- just get all keys
            changes = db.changed_keys()
        else
            # may be able to use tracked changes...
            {changes, from_db} = @_doc.get_doc().changes()
            @_doc.get_doc().reset_changes()
            if from_db != @_last_db
                # NOPE: have to compute the hard (but rock solid and accurate) way.
                changes = db.changed_keys(@_last_db)

        if changes.size > 0 or @_first_change_event  # something actually probably changed
            @emit('change', changes)
        @_last_db = db
        delete @_first_change_event

    close: () =>
        if not @_doc?
            return
        @removeAllListeners()
        @_doc?.close()
        delete @_doc

    is_closed: =>
        return not @_doc?

    sync: (cb) =>
        @_check()
        @_doc.save(cb)
        return

    save: (cb) =>
        @_check()
        @_doc.save_to_disk(cb)
        return

    # for compat with syncstring api.
    _save: (cb) => @save(cb)
    save_to_disk: (cb) => @save(cb)

    # also for compat api.
    set_settings: (obj) => @_doc.set_settings(obj)
    get_settings: => return @_doc.get_settings()


    save_asap: (cb) =>
        @_check()
        @_doc.save_asap(cb)
        return

    set_doc: (value) =>
        @exit_undo_mode()
        @_check()
        @_doc.set_doc(value)
        return

    get_doc: () =>
        @_check()
        return @_doc.get_doc()

    get_path: =>
        @_check()
        return @_doc.get_path()

    get_project_id: =>
        return @_doc.get_project_id()

    # change (or create) exactly *one* database entry that matches
    # the given where criterion.
    set: (obj, save=true) =>
        @exit_undo_mode()
        doc = @_doc?.get_doc()
        if not doc?   # see https://github.com/sagemathinc/cocalc/issues/2130
            return
        @_doc.set_doc(new Doc(doc._db.set(obj)))
        if save
            @_doc.save()
        @_on_change()
        return

    get: (where, time) =>
        if not @_doc?
            return immutable.List()
        if time?
            d = @_doc.version(time)
        else
            d = @_doc.get_doc()
        if not d?
            return
        return d._db.get(where)

    get_one: (where, time) =>
        if not @_doc?
            return
        if time?
            d = @_doc.version(time)
        else
            d = @_doc.get_doc()
        if not d?
            return
        return d._db.get_one(where)

    # delete everything that matches the given criterion; returns number of deleted items
    delete: (where, save=true) =>
        @exit_undo_mode()
        if not @_doc?
            return
        d = @_doc.get_doc()
        if not d?
            return
        @_doc.set_doc(new Doc(d._db.delete(where)))
        if save
            @_doc.save()
        @_on_change()
        return

    versions: =>
        @_check()
        return @_doc.versions()

    last_changed: =>
        @_check()
        return @_doc.last_changed()

    all_versions: =>
        @_check()
        return @_doc.all_versions()

    version: (t) =>
        @_check()
        return @_doc.version(t)

    account_id: (t) =>
        @_check()
        return @_doc.account_id(t)

    time_sent: (t) =>
        @_check()
        return @_doc.time_sent(t)

    show_history: (opts) =>
        @_check()
        return @_doc.show_history(opts)

    has_full_history: =>
        @_check()
        return @_doc.has_full_history()

    load_full_history: (cb) =>
        @_check()
        @_doc.load_full_history(cb)

    wait_until_read_only_known: (cb) =>
        @_check()
        return @_doc.wait_until_read_only_known(cb)

    get_read_only: =>
        @_check()
        return @_doc.get_read_only()

    count: =>
        @_check()
        return @_doc.get_doc()._db.size

    undo: =>
        @_check()
        @_doc.set_doc(@_doc.undo())
        @_doc.save()
        @_on_change()
        return

    redo: =>
        @_check()
        @_doc.set_doc(@_doc.redo())
        @_doc.save()
        @_on_change()
        return

    exit_undo_mode: =>
        @_doc?.exit_undo_mode()

    in_undo_mode: =>
        @_check()
        return @_doc.in_undo_mode()

    revert: (version) =>
        @_check()
        @_doc.revert(version)
        @_doc.save()
        return

    set_cursor_locs: (locs, side_effect) =>
        @_check()
        @_doc.set_cursor_locs(locs, side_effect)
        return

    get_cursors: =>
        return @_doc?.get_cursors()

# Open an existing sync document -- returns instance of SyncString or SyncDB, depending
# on what is already in the database.  Error if file doesn't exist.
exports.open_existing_sync_document = (opts) ->
    opts = defaults opts,
        client     : required
        project_id : required
        path       : required
        cb         : required
    opts.client.query
        query :
            syncstrings:
                project_id : opts.project_id
                path       : opts.path
                doctype    : null
        cb: (err, resp) ->
            if err
                opts.cb(err)
                return
            if resp.event == 'error'
                opts.cb(resp.error)
                return
            if not resp.query?.syncstrings?
                opts.cb("no document '#{opts.path}' in project '#{opts.project_id}'")
                return
            doctype = JSON.parse(resp.query.syncstrings.doctype ? '{"type":"string"}')
            opts2 =
                project_id : opts.project_id
                path       : opts.path
            if doctype.opts?
                opts2 = misc.merge(opts2, doctype.opts)
            doc = opts.client["sync_#{doctype.type}2"](opts2)
            opts.cb(undefined, doc)




