{defaults, required, from_json, to_json} = require('misc')
syncdoc = require('syncdoc')

class SynchronizedDB
    constructor: (@project_id, @filename, cb) ->
        syncdoc.synchronized_string
            project_id : @project_id
            filename   : @filename
            cb         : (err, doc) =>
                if err
                    cb(err)
                else
                    @doc = doc
                    @_set_data_from_doc()
                    @doc.on 'sync', () =>
                        console.log("got sync")
                        @_set_data_from_doc()
                    cb(undefined, @)

    # set the data object to equal what is defined in the syncdoc
    _set_data_from_doc: () =>
        console.log("setting data from doc=",@doc.live())
        @data = []
        for x in @doc.live().split('\n')
            if x.length > 0
                @data.push(from_json(x))

    _set_doc_from_data: (line) =>
        # TODO: possibly stupidly inefficient...
        v = @doc.live().split('\n')
        v[line] = to_json(@data[line])
        @doc.live(v.join('\n'))
        @doc.save()

    # change exactly one database entry that matches the given where criterion.
    update: (opts) =>
        opts = defaults opts,
            set   : required
            where : required
        set = opts.set
        where = opts.where
        i = 0
        for x in @data
            match = true
            for k, v of where
                if x[k] != v
                    match = false
                    break
            if match
                for k, v of set
                    x[k] = v
                @_set_doc_from_data(i)
                return
            i += 1
        new_obj = {}
        for k, v of set
            new_obj[k] = v
        for k, v of where
            new_obj[k] = v
        @data.push(new_obj)
        @_set_doc_from_data(i)

    # return list of all database objects that match given condition.
    select: (where={}) =>
        result = []
        for x in @data
            match = true
            for k, v of where
                if x[k] != v
                    match = false
                    break
            if match
                result.push(x)
        return result

exports.synchronized_db = (opts) ->
    opts = defaults opts,
        project_id : required
        filename   : required
        cb         : required
    new SynchronizedDB(opts.project_id, opts.filename, opts.cb)

