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

#---------------------------------------------------------------------------------------------------------
# Support for using a synchronized doc as a synchronized document database
# storing one record per line in JSON.
#---------------------------------------------------------------------------------------------------------

###
Synchronized document-oriented database, based on a synchronized string.
###

###
For now _doc -- in the constructor of SynchronizedDB
has a different API than DiffSync objects above.
The wrapper object below allows you to use a DiffSync
object with this API.

    _doc.on 'sync' -- event emitted on successful sync
    _doc.live() -- returns current live string
    _doc.live('new value') -- set current live string
    _doc.sync(cb) -- cause sync of _doc
    _doc.save(cb) -- cause save of _doc to persistent storage
    _doc.readonly -- true if and only if doc is readonly

Events:

  - 'before-change'
  - 'sync'
  - 'change'

###

exports.MAX_SAVE_TIME_S = MAX_SAVE_TIME_S = 30

{EventEmitter} = require('events')

misc = require('./misc')
{defaults, required, hash_string, len} = misc

class exports.SynchronizedDB extends EventEmitter
    constructor: (@_doc, @to_json, @from_json, @max_len) ->
        if not @to_json?
            # We use a stable algorithm for converting to JSON, so that
            # on all machines we always get the same result every time; this
            # is important so that we can easily/correctly sync the syncstring with
            # the in-memory data structure using hashes.
            @to_json = require('json-stable-stringify')
        if not @from_json?
            @from_json = misc.from_json
        @readonly = @_doc.readonly
        @_data = {}
        @valid_data = @_set_data_from_doc()
        @_doc.on 'before-change', () =>
            @emit('before-change')
            @_live_before_sync = @_doc?.live()  # doc could be deleted when this is called, due to destroy method.
        @_doc.on('sync', @_on_sync)

    has_unsaved_changes: =>
        return @_doc.has_unsaved_changes()

    has_uncommitted_changes: =>
        return @_doc.has_uncommitted_changes()

    _on_sync: () =>
        if not @_doc?
            return
        @emit('sync')
        #console.log("syncdb -- syncing")
        if not @_set_data_from_doc() and @_live_before_sync?
            #console.log("DEBUG: invalid/corrupt sync request; revert it")
            @_doc.live(@_live_before_sync)
            @_set_data_from_doc()
            @_doc.sync()

    destroy: () =>
        @_doc?.removeListener('sync', @_on_sync)
        @_doc?.disconnect_from_session()
        delete @_doc
        delete @_data
        @removeAllListeners()

    # set the data object to equal what is defined in the syncdoc
    _set_data_from_doc: () =>
        if not @_doc?
            return
        # change/add anything that has changed or been added
        i = 0  # the current line
        hashes = {}     # hashes of lines in the synchronized string that represents this local "database"
        changes = []    # list of changes: inserts, deletes, etc., that we'll make to update the local db from the string
        is_valid = true          # json corruption: whether any json was corrupt
        duplicate_lines = false  # another type of corruption: same line duplicated
        for x in @_doc.live().split('\n')
            # for each line, compute its hash and check to see if we already know it locally
            if x.trim().length == 0
                # ignore empty lines - might as well be robust against them.
                i += 1
                continue
            h = hash_string(x)
            if hashes[h]
                # duplicate line in @_doc file! -- should never happen,
                # but could happen anyways in case of corruption, so
                # our code may as well be robust against it.
                i += 1
                duplicate_lines = true  # remember to fix the document later
                continue
            # Found an interesting new line -- record the hash of it.
            hashes[h] = x
            if not @_data[h]?
                # We don't know the data defined by this line of the
                # syncstring locally, so record it.
                try
                    data = @from_json(x)
                catch e
                    # Dang -- Invalid/corrupted json -- still, we try out best
                    # WE will revert this, unless it is on the initial load.
                    data = {'corrupt':x}
                    is_valid = false
                @_data[h] = {data:data, line:i}
                changes.push({insert:misc.deep_copy(data)})
            i += 1
        for h,v of @_data
            if not hashes[h]?
                # delete this record
                changes.push({remove:v.data})
                delete @_data[h]
        if changes.length > 0
            # sort moving the remove's before the inserts, so code that
            # handles these changes gets the correct result by applying them
            # in order (since mutate = remove and insert)
            changes.sort (a,b) ->
                if a.remove? and b.remove?
                    return 0
                else if a.remove? and b.insert?
                    return -1
                else if a.insert? and b.remove?
                    return 1
            @emit("change", changes)
        if duplicate_lines
            # There was corruption involving multiple copies of the same line
            # in @_doc, so we fix that.  Just setting the whole @_doc from
            # the database is extra work, but fixes things.
            @_set_doc_from_data()
        return is_valid

    # Set the synchronized string from our local database.  If hash
    # is given, only sets ...?
    _set_doc_from_data: (hash) =>
        if not @_doc?
            return
        if hash? and @_data[hash]?
            # The second condition "@_data[hash]?" is due to the potential
            # of @_data changing before _set_doc_from_data called and the
            # corresponding object being gone.
            # Only one line changed
            d = @_data[hash]
            v = @_doc.live().split('\n')
            v[d.line] = @to_json(d.data)
            new_hash = hash_string(v[d.line])
            if new_hash != hash
                @_data[new_hash] = d
                delete @_data[hash]
        else
            # possible major change to doc (e.g., deleting or adding records)
            m = []
            for hash, x of @_data
                m[x.line] = {hash:hash, x:x}
            m = (x for x in m when x?)
            line = 0
            v = []
            for z in m
                if not z?
                    continue
                z.x.line = line
                v.push(@to_json(z.x.data))
                line += 1
        @_doc.live(v.join('\n'))
        @_doc.sync()

    save: (cb) =>
        if not @_doc?
            cb?("@_doc not defined")
            return
        if @_saving_cbs?
            @_saving_cbs.push(cb)
            return
        @_saving_cbs = [cb]
        f = (cb) =>
            @sync (err) =>
                if err
                    cb(err)
                else
                    if not @_doc?
                        cb?("@_doc not defined")
                    else
                        @_doc.save(cb)
        misc.retry_until_success
            f : f
            start_delay : 3000
            max_delay   : 5000
            factor      : 1.3
            max_time    : 1000*MAX_SAVE_TIME_S
            cb          : (err) =>
                for cb in @_saving_cbs
                    cb?(err)
                delete @_saving_cbs

    sync: (cb) =>
        #console.log("returning fake save error"); cb?("fake saving error"); return
        if not @_doc?
            cb?("@_doc not defined")
        else
            @_doc.sync(cb)

    # change (or create) exactly *one* database entry that matches
    # the given where criterion.
    update: (opts) =>
        opts = defaults opts,
            set        : required
            where      : required
            is_equal   : (a, b) => a == b # applies to equality of `where`
        if not @_doc?
            return
        {set, where, is_equal} = opts
        #console.log("update(set='#{misc.to_json(set)}',where='#{misc.to_json(where)}')")
        i = 0
        for hash, val of @_data
            match = true
            x = val.data
            for k, v of where
                if not is_equal(x[k], v)
                    match = false
                    break
            if match
                # modify exactly one existing database entry
                #console.log("update: change '#{misc.to_json(x)}'?")
                changed = false
                before = misc.deep_copy(x)
                for k, v of set
                    if not changed and misc.to_json(x[k]) != misc.to_json(v)
                        changes = [{remove:before}]
                        changed = true
                    x[k] = v
                if changed
                    #console.log("update: yes, to '#{misc.to_json(x)}'")
                    if @max_len?
                        cur_len = @_doc.live().length
                        new_len = misc.to_json(x).length - misc.to_json(before).length + cur_len
                        if new_len > @max_len
                            @_data[hash].data = before
                            throw {error:"max_len", new_len:new_len, cur_len:cur_len, max_len:@max_len}
                    # actually changed something
                    changes.push({insert:misc.deep_copy(x)})
                    @emit("change", changes)
                    #console.log("update: from '#{@_doc.live()}'")
                    @_set_doc_from_data(hash)
                    #console.log("update: to   '#{@_doc.live()}'")
                return
            i += 1

        # add a new entry
        new_obj = {}
        for k, v of set
            new_obj[k] = v
        for k, v of where
            new_obj[k] = v
        j = @to_json(new_obj)
        if @max_len?
            cur_len = @_doc.live().length
            new_len = j.length + 1 + @_doc.live().length
            if new_len > @max_len
                throw {error:"max_len", new_len:new_len, cur_len:cur_len, max_len:@max_len}
        hash = hash_string(j)
        @_data[hash] = {data:new_obj, line:len(@_data)}
        @_set_doc_from_data(hash)
        @emit("change", [{insert:misc.deep_copy(new_obj)}])

    # return list of all database objects that match given condition.
    select: (opts={}) =>
        {where} = defaults opts,
            where : {}
        if not @_data?
            return []
        result = []
        for hash, val of @_data
            x = val.data
            match = true
            for k, v of where
                if x[k] != v
                    match = false
                    break
            if match
                result.push(x)
        return misc.deep_copy(result)

    # return first database objects that match given condition or undefined if there are no matches
    select_one: (opts={}) =>
        {where} = defaults opts,
            where : {}
        if not @_data?
            return
        for hash, val of @_data
            x = val.data
            match = true
            for k, v of where
                if x[k] != v
                    match = false
                    break
            if match
                return misc.deep_copy(x)

    # delete everything that matches the given criterion; returns number of deleted items
    delete: (opts) =>
        {where, one} = defaults opts,
            where : required  # give {} to delete everything ?!
            one   : false
        if not @_data?
            return 0
        result = []
        i = 0
        changes = []
        for hash, val of @_data
            x = val.data
            match = true
            for k, v of where
                if x[k] != v
                    match = false
                    break
            if match
                i += 1
                changes.push({remove:x})
                delete @_data[hash]
                if one
                    break
        if i > 0
            @_set_doc_from_data()
            @emit("change", changes)
        return i

    # delete any entries in the database that have the given field defined at all.
    delete_with_field: (opts) =>
        {field} = defaults opts,
            field : required
        if not @_data?
            return 0
        result = []
        i = 0
        changes = []
        for hash, val of @_data
            if val.data[field]?
                i += 1
                changes.push({remove:val.data})
                delete @_data[hash]
        if i > 0
            @_set_doc_from_data()
            @emit("change", changes)
        return i

    # delete first thing in db that matches the given criterion
    delete_one: (opts) =>
        opts.one = true
        @delete(opts)

    # anything that couldn't be parsed from JSON as a map gets converted to {key:thing}.
    ensure_objects: (key) =>
        if not @_data?
            return
        changes = {}
        for h,v of @_data
            if typeof(v.data) != 'object'
                x = v.data
                v.data = {}
                v.data[key] = x
                h2 = hash_string(@to_json(v.data))
                delete @_data[h]
                changes[h2] = v
        if misc.len(changes) > 0
            for h, v of changes
                @_data[h] = v
            @_set_doc_from_data()

    # ensure that every db entry has a distinct uuid value for the given key
    ensure_uuid_primary_key: (key) =>
        if not @_data?
            return
        uuids   = {}
        changes = {}
        for h,v of @_data
            if not v.data[key]? or uuids[v.data[key]]  # not defined or seen before
                v.data[key] = misc.uuid()
                h2 = hash_string(@to_json(v.data))
                delete @_data[h]
                changes[h2] = v
            uuids[v.data[key]] = true
        if misc.len(changes) > 0
            w = []
            for h, v of changes
                w.push({remove:@_data[h]})
                w.push({insert:v})
            @emit("change", w)

            for h, v of changes
                @_data[h] = v
            @_set_doc_from_data()

    count: () =>
        return misc.len(@_data)


