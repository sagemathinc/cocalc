###

CoCalc, (c) 2017 SageMath, Inc., AGPLv3
###

{required, defaults} = require('./misc')

{SyncDoc} = require('./syncstring')
db_doc = require('./db-doc-immutable')

class Doc
    constructor: (@_db) ->
        if not @_db?
            throw Error("@_db must be defined")

    to_str: =>
        return @_db.to_str()

    is_equal: (other) =>
        return @_db.equals(other._db)

    apply_patch: (patch) =>
        window.db = @_db
        window.patch = patch
        return new Doc(@_db.apply_patch(patch))

    make_patch: (other) =>
        return @_db.make_patch(other._db)

class exports.SyncDB extends SyncDoc
    constructor: (opts) ->
        opts = defaults opts,
            id                : undefined
            client            : required
            project_id        : undefined
            path              : undefined
            save_interval     : undefined
            file_use_interval : undefined
            primary_keys      : required
            string_cols       : []

        from_str = (str) ->
            db = db_doc.from_str
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



