###
Schema for synchronized editing of strings.

(c) William Stein, 2016
###

misc = require('./misc')

schema = require('./schema').SCHEMA

schema.syncstrings =
    primary_key : 'string_id'
    fields :
        string_id :
            type : 'sha1'
            desc : 'id of this synchronized string sha1 hash of (project_id and path)'
        project_id :
            type : 'uuid'
            desc : 'optional project that this synchronized string belongs to (if it belongs to a project)'
        last_active :
            type : 'timestamp'
            desc : 'when a user most-recently "cared" about this syncstring (syncstring will be automatically opened in running project if last_active is sufficiently recent)'
        last_file_change:
            type : 'timestamp'
            desc : 'when file on disk last changed not due to save (used by Jupyter sync)'
        path :
            type : 'string'
            desc : 'optional path of file being edited'
        deleted :
            type : 'boolean'
            desc : 'if true, the file was deleted; client **must** create file on disk before editing again.'
        init :
            type : 'object'
            desc : '{time:timestamp, error:?} - info about what happened when backend tried to initialize this string'
        save :
            type : 'map'
            desc : "{state:['requested', 'done'], hash:misc.hash_string(what was last saved), error:['' or 'error message']}"
        read_only :
            type : 'boolean'
            desc : 'true or false, depending on whether this syncstring is readonly or can be edited'
        users :
            type : 'array'
            desc : "array of account_id's of those who have edited this string. Index of account_id in this array is used to represent patch authors."
        last_snapshot :
            type : 'timestamp'
            desc : 'timestamp of a recent snapshot; if not given, assume no snapshots.  This is used to restrict the range of patches that have to be downloaded in order start editing the file.'
        snapshot_interval :
            type : 'integer'
            desc : 'If m=snapshot_interval is given and there are a total of n patches, then we (some user) should make snapshots at patches m, 2*m, ..., k, where k<=n-m.'
        archived :
            type : 'uuid'
            desc : "if set, then syncstring patches array have been archived in the blob with given uuid."

    indexes:
        project_last_active : ["[that.r.row('project_id'),that.r.row('last_active')]"]

    user_query:
        get :
            all:
                cmd   : 'getAll'
                args  : (obj, db) -> [obj.string_id]
            fields :
                string_id         : (obj, db) -> db.sha1(obj.project_id, obj.path)
                users             : null
                last_snapshot     : null
                snapshot_interval : 150      # unclear how good of a choice 150 is...
                project_id        : null
                path              : null
                deleted           : null
                save              : null
                last_active       : null
                init              : null
                read_only         : null
                last_file_change  : null
            required_fields :
                path              : true
                project_id        : true
            check_hook : (db, obj, account_id, project_id, cb) ->
                db._syncstrings_check obj, account_id, project_id, (err) ->
                    if not err
                        database.unarchive_patches(string_id: obj.string_id, cb:cb)
                    else
                        cb(err)

        set :
            fields :
                string_id         : (obj, db) -> db.sha1(obj.project_id, obj.path)
                users             : true
                last_snapshot     : true
                snapshot_interval : true
                project_id        : true
                path              : true
                deleted           : true
                save              : true
                last_active       : true
                init              : true
                read_only         : true
                last_file_change  : true
            required_fields :
                path              : true
                project_id        : true
            check_hook : (db, obj, account_id, project_id, cb) ->
                db._syncstrings_check(obj, account_id, project_id, cb)
            on_change : (db, old_val, new_val, account_id, cb) ->
                db._user_set_query_syncstring_change_after(old_val, new_val, account_id, cb)


schema.syncstrings.project_query = misc.deep_copy(schema.syncstrings.user_query)

schema.syncstrings_delete  =
    primary_key : schema.syncstrings.primary_key
    virtual     : 'syncstrings'
    fields      : schema.syncstrings.fields
    user_query:
        set :  # use set query since selecting only one record by its primary key
            admin   : true   # only admins can do get queries on this virtual table
            delete  : true   # allow deletes
            options : [{delete:true}]   # always delete when doing set on this table, even if not explicitly requested
            fields  :
                string_id  : (obj, db) -> db.sha1(obj.project_id, obj.path)
                project_id : true
                path       : true
            required_fields :
                project_id : true
                path       : true
            check_hook : (db, obj, account_id, project_id, cb) ->
                db._syncstrings_check(obj, account_id, project_id, cb)

schema.recent_syncstrings_in_project =
    primary_key : schema.syncstrings.primary_key
    virtual     : 'syncstrings'
    fields :
        string_id   : true
        project_id  : true
        last_active : true
        path        : true
        deleted     : true
    user_query :
        get :
            all :
                cmd  : 'between'
                args : (obj, db) -> [[obj.project_id, misc.minutes_ago(obj.max_age_m)], [obj.project_id, db.r.maxval], index:'project_last_active']
            fields :
                project_id  : null
                max_age_m   : 'null'
                string_id   : null
                last_active : null
                path        : null
                deleted     : null
            required_fields :
                project_id  : true
                max_age_m   : true
            check_hook : (db, obj, account_id, project_id, cb) ->
                db._syncstrings_check(obj, account_id, project_id, cb)

schema.recent_syncstrings_in_project.project_query = schema.recent_syncstrings_in_project.user_query

schema.patches =
    primary_key   : 'id'  # this is a compound primary key as an array -- [string_id, time]
    unique_writes : true   # there is no reason for a user to write exactly the same record twice
    fields :
        id       :
            type : 'compound key [string_id, time]'
            desc : 'Primary key'
        user     :
            type : 'number'
            desc : 'a nonnegative integer; this is an index into syncstrings.users'
        patch    :
            type : 'string'
            desc : 'JSON string the parses to a patch, which goes from the previous of the syncstring to this version'
        snapshot :
            type : 'string'
            desc : 'Optionally, gives the state of the string at this point in time; this should only be set some time after the patch at this point in time was made. Knowing this snap and all future patches determines all the future versions of the syncstring.'
        sent :
            type : 'timestamp'
            desc : 'Optional approximate time at which patch was **actually** sent to the server, which is approximately when it was really made available to other users.  In case of offline editing, patches from days ago might get inserted into the stream, and this makes it possible for the client to know and behave accordingly.  If this is not set then patch was sent about the same time it was created.'
        prev :
            type : 'timestamp'
            desc : "Optional field to indicate patch dependence; if given, don't apply this patch until the patch with timestamp prev has been applied."
    user_query :
        get :
            all :
                cmd : 'between'
                args  : (obj, db) -> [[obj.id[0], obj.id[1] ? db.r.minval], [obj.id[0], db.r.maxval]]
            fields :
                id       : 'null'   # 'null' = field gets used for args above then set to null
                patch    : null
                user     : null
                snapshot : null
                sent     : null
                prev     : null
            check_hook : (db, obj, account_id, project_id, cb) ->
                # this verifies that user has read access to these patches
                db._user_get_query_patches_check(obj, account_id, project_id, cb)
        set :
            fields :
                id       : true
                patch    : true
                user     : true
                snapshot : true
                sent     : true
                prev     : true
            required_fields :
                id       : true
                patch    : true
            check_hook : (db, obj, account_id, project_id, cb) ->
                # this verifies that user has write access to these patches
                db._user_set_query_patches_check(obj, account_id, project_id, cb)
            before_change : (database, old_val, new_val, account_id, cb) ->
                if old_val?
                    # CRITICAL: not allowing this seems to cause a lot of problems
                    #if old_val.sent and new_val.sent and new_val.sent - 0 != old_val.sent - 0   # CRITICAL: comparing dates here!
                    #    cb("you may not change the sent time once it is set")
                    #    return
                    if old_val.user? and new_val.user? and old_val.user != new_val.user
                        cb("you may not change the author of a patch from #{old_val.user} to #{new_val.user}")
                        return
                    if old_val.patch? and new_val.patch? and old_val.patch != new_val.patch   # comparison is ok since it is of *strings*
                        cb("you may not change a patch")
                        return
                cb()

schema.patches.project_query = schema.patches.user_query

# Table to be used for deleting the patches associated to a syncstring.
# Currently only allowed by admin.
schema.patches_delete  =
    primary_key : schema.patches.primary_key
    virtual     : 'patches'
    fields      : schema.patches.fields
    user_query:
        get :  # use get query since selecting a range of records for deletion
            all :
                cmd     : 'between'
                args    : (obj, db) -> [[obj.id[0], obj.id[1] ? db.r.minval], [obj.id[0], db.r.maxval]]
                options : [{delete:true}]   # always delete
            admin  : true
            delete : true
            fields :
                id   : 'null'
                dummy : null
            check_hook : (db, obj, account_id, project_id, cb) ->
                # this verifies that user has read access to these patches -- redundant with admin requirement above.
                db._user_get_query_patches_check(obj, account_id, project_id, cb)


schema.cursors =
    primary_key: 'id'  # this is a compound primary key as an array -- [string_id, user_id]
    durability : 'soft' # loss of data for the cursors table just doesn't matter
    fields:
        id   : true    # [string_id, user_id]
        locs : true    # [{x:?,y:?}, ...]    <-- locations of user_id's cursor(s)
        time : true    # time when these cursor positions were sent out
    indexes :
        string_id : ["that.r.row('id')(0)"]
    user_query:
        get :
            all :  # query gets all cursors of *all users* with given string_id -- uses index instead of commented out range query
                #cmd  : 'between'
                #args : (obj, db) -> [[obj.string_id, db.r.minval], [obj.string_id, db.r.maxval]]
                cmd  : 'getAll'
                args : (obj, db) -> [obj.string_id, index:'string_id']
            fields :
                id        : null
                locs      : null
                time      : null
                string_id : 'null'  # virtual -- only used for query, not kept in table
            check_hook : (db, obj, account_id, project_id, cb) ->
                # this verifies that user has read access to these cursors
                db._user_get_query_cursors_check(obj, account_id, project_id, cb)
        set :
            fields :
                id     : true    # [string_id, user_id] for setting!
                locs   : true
                time   : true
            required_fields :
                id     : true
                locs   : true
                time   : true
            check_hook : (db, obj, account_id, project_id, cb) ->
                # this verifies that user has write access to these cursors
                db._user_set_query_cursors_check(obj, account_id, project_id, cb)

schema.eval_inputs =
    primary_key: 'id'  # this is a compound primary key as an array -- [string_id, time, user_id]
    durability : 'soft' # loss of eval requests not serious
    unique_writes: true
    fields:
        id    : true
        input : true
    user_query:
        get :
            all :  # if id in query is [string_id, t], this gets evals with given string_id and time >= t
                cmd  : 'between'
                args : (obj, db) -> [[obj.id[0], obj.id[1] ? db.r.minval, db.r.minval], [obj.id[0], db.r.maxval, db.r.maxval]]
            fields :
                id    : 'null'   # 'null' = field gets used for args above then set to null
                input : null
            check_hook : (db, obj, account_id, project_id, cb) ->
                db._syncstring_access_check(obj.id?[0], account_id, project_id, cb)
        set :
            fields :
                id    : true
                input : true
            required_fields :
                id    : true
                input : true
            check_hook : (db, obj, account_id, project_id, cb) ->
                db._syncstring_access_check(obj.id?[0], account_id, project_id, cb)

schema.eval_inputs.project_query = schema.eval_inputs.user_query

schema.eval_outputs =
    primary_key: 'id'  # this is a compound primary key as an array -- [string_id, time, output_number starting at 0]
    durability : 'soft' # loss of eval output not serious (in long term only used for analytics)
    fields:
        id     : true
        output : true
    user_query:
        get :
            all :  # if id in query is [string_id, t], this gets evals with given string_id and time >= t
                cmd  : 'between'
                args : (obj, db) -> [[obj.id[0], obj.id[1] ? db.r.minval, db.r.minval], [obj.id[0], db.r.maxval, db.r.maxval]]
            fields :
                id    : 'null'   # 'null' = field gets used for args above then set to null
                output : null
            check_hook : (db, obj, account_id, project_id, cb) ->
                db._syncstring_access_check(obj.id?[0], account_id, project_id, cb)
        set :
            fields :
                id    : true
                output : true
            required_fields :
                id    : true
                output : true
            check_hook : (db, obj, account_id, project_id, cb) ->
                db._syncstring_access_check(obj.id?[0], account_id, project_id, cb)

schema.eval_outputs.project_query = schema.eval_outputs.user_query



