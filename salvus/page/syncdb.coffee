{defaults, required, from_json, to_json, hash_string, len} = require('misc')
syncdoc = require('syncdoc')
{EventEmitter} = require('events')

class SynchronizedDB extends EventEmitter
    constructor: (@project_id, @filename, cb) ->
        syncdoc.synchronized_string
            project_id : @project_id
            filename   : @filename    # should end with .smcdb
            cb         : (err, doc) =>
                if err
                    cb(err)
                else
                    @_doc = doc
                    @_data = {}
                    @_set_data_from_doc()
                    @_doc.on 'sync', () =>
                        @_set_data_from_doc()
                    cb(undefined, @)

    # set the data object to equal what is defined in the syncdoc
    _set_data_from_doc: () =>
        # change/add anything that has changed or been added
        i = 0
        hashes = {}
        changes = []
        for x in @_doc.live().split('\n')
            if x.length > 0
                h = hash_string(x)
                hashes[h] = true
                if not @_data[h]?
                    data = from_json(x)
                    @_data[h] = {data:data, line:i}
                    changes.push({insert:data})
            i += 1
        # delete anything that was deleted
        for h,v of @_data
            if not hashes[h]?
                changes.push({remove:v.data})
                delete @_data[h]
        if changes.length > 0
            @emit("change", changes)

    _set_doc_from_data: (hash) =>
        if hash?
            # only one line changed
            d = @_data[hash]
            v = @_doc.live().split('\n')
            v[d.line] = to_json(d.data)
        else
            # major change to doc (e.g., deleting records)
            m = []
            for hash, x of @_data
                m[x.line] = {hash:hash, x:x}
            m = (x for x in m if x?)
            line = 0
            v = []
            for z in m
                z.x.line = line
                v.push(to_json(z.x.data))
                line += 1
        @_doc.live(v.join('\n'))
        @_doc.save()

    # change exactly *one* database entry that matches the given where criterion.
    update: (opts) =>
        opts = defaults opts,
            set   : required
            where : required
        set = opts.set
        where = opts.where
        i = 0
        for hash, val of @_data
            match = true
            x = val.data
            for k, v of where
                if x[k] != v
                    match = false
                    break
            if match
                for k, v of set
                    x[k] = v
                @_set_doc_from_data(hash)
                return
            i += 1
        new_obj = {}
        for k, v of set
            new_obj[k] = v
        for k, v of where
            new_obj[k] = v
        hash = hash_string(to_json(new_obj))
        @_data[hash] = {data:new_obj, line:len(@_data)}
        @_set_doc_from_data(hash)

    # return list of all database objects that match given condition.
    select: (where={}) =>
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
        return result

    # return first database objects that match given condition or undefined if there are no matches
    select_one: (where={}) =>
        result = []
        for hash, val of @_data
            x = val.data
            match = true
            for k, v of where
                if x[k] != v
                    match = false
                    break
            if match
                return x

    # delete everything that matches the given criterion
    delete: (where, one=false) =>
        result = []
        for hash, val of @_data
            x = val.data
            match = true
            for k, v of where
                if x[k] != v
                    match = false
                    break
            if match
                delete @_data[hash]
                if one
                    break
        @_set_doc_from_data()

    # delete first thing in db that matches the given criterion
    delete_one: (where) =>
        @delete(where, true)



exports.synchronized_db = (opts) ->
    opts = defaults opts,
        project_id : required
        filename   : required
        cb         : required
    new SynchronizedDB(opts.project_id, opts.filename, opts.cb)

