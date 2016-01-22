###
Schema for synchronized editing of strings.
###

misc = require('./misc')

schema = require('./schema').SCHEMA

# TODO -- currently no security/auth
schema.syncstrings =
    primary_key : 'string_id'
    fields :
        string_id :
            type : 'uuid'
            desc : 'id of this synchronized string'
        project_id :
            type : 'uuid'
            desc : 'optional project that this synchronized string belongs to (if it belongs to a project)'
        last_active :
            type : 'timestamp'
            desc : 'when a user most-recently "cared" about this syncstring (syncstring will be automatically opened in running project if last_active is sufficiently recent)'
        path :
            type : 'string'
            desc : 'optional path of file being edited'
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

    indexes:
        project_last_active : ["[that.r.row('project_id'),that.r.row('last_active')]"]

    user_query:
        get :
            all:
                cmd   : 'getAll'
                args  : (obj, db) -> [obj.string_id]
            fields :
                string_id         : null
                users             : null
                last_snapshot     : null
                snapshot_interval : 250      # unclear how good of a choice this is...
                project_id        : null
                path              : null
                save              : null
                last_active       : null
                init              : null
                read_only         : null

        set :
            # TODO: impose constraints on what can set
            fields :
                string_id         : true
                users             : true
                last_snapshot     : true
                snapshot_interval : true
                project_id        : true
                path              : true
                save              : true
                last_active       : true
                init              : true
                read_only         : true

schema.syncstrings.project_query = misc.deep_copy(schema.syncstrings.user_query)     #TODO -- will be different!

# TODO -- currently no security/auth
schema.recent_syncstrings_in_project =
    primary_key : schema.syncstrings.primary_key
    virtual     : 'syncstrings'
    fields :
        string_id   : true
        project_id  : true
        last_active : true
        path        : true
    user_query :
        get :
            all :
                cmd  : 'between'
                args : (obj, db) -> [[obj.project_id, misc.minutes_ago(obj.max_age_m)], [obj.project_id, db.r.maxval], index:'project_last_active']
            fields :
                project_id  : true
                max_age_m   : 'null'
                string_id   : null
                last_active : null
                path        : null

schema.recent_syncstrings_in_project.project_query = schema.recent_syncstrings_in_project.user_query

# TODO -- currently no security/auth
# TODO: need an index!
schema.patches =
    primary_key: 'id'  # this is a compound primary key as an array -- [string_id, time, user_id]
    fields:
        id       :
            type : 'compound key [string_id, time, user_id]'
            desc : 'Primary key'
        patch    :
            type : 'object'
            desc : 'A patch, which goes from the previous of the syncstring to this version'
        snapshot :
            type : 'string'
            desc : 'Optionally gives the state of the string at this point in time; this should only be set some time after the patch at this point in time was made. Knowing this snap and all future patches determines all the future versions of the syncstring.'
    user_query:
        get :
            all :  # if input id in query is [string_id, t], this gets patches with given string_id and time >= t
                cmd  : 'between'
                args : (obj, db) -> [[obj.id[0], obj.id[1] ? db.r.minval, db.r.minval], [obj.id[0], db.r.maxval, db.r.maxval]]
            fields :
                id       : 'null'   # 'null' = field gets used for args above then set to null
                patch    : null
                snapshot : null
        set :
            fields :
                id       : true
                patch    : true
                snapshot : true
            required_fields :
                id       : true
                patch    : true

schema.patches.project_query = schema.patches.user_query     #TODO -- will be different!

schema.cursors =
    primary_key: 'id'  # this is a compound primary key as an array -- [doc_id, user_id]
    fields:
        id   : true    # [doc_id, user_id]
        locs : true    # [{x:?,y:?}, ...]    <-- locations of user_id's cursor(s)
        time : true    # time when these cursor positions were sent out
        caused : true  # whether or not cursor move caused by user editing
    user_query:
        get :
            all :  # if input id in query is doc_id, this gets all cursors of *all users* with given doc_id
                cmd  : 'between'
                args : (obj, db) -> [[obj.doc_id, db.r.minval], [obj.doc_id, db.r.maxval]]
            fields :
                doc_id : 'null'  # virtual
                id     : null
                locs   : null
                time   : null
                caused : null
        set :
            fields :
                id     : true    # [doc_id, user_id] for setting!
                locs   : true
                time   : true
                caused : true
            required_fields :
                id     : true
                locs   : true
                time   : true
                caused : true

schema.eval_inputs =
    primary_key: 'id'  # this is a compound primary key as an array -- [string_id, time, user_id]
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
        set :
            fields :
                id    : true
                input : true
            required_fields :
                id    : true
                input : true

schema.eval_inputs.project_query = schema.eval_inputs.user_query

schema.eval_outputs =
    primary_key: 'id'  # this is a compound primary key as an array -- [string_id, time, output_number starting at 0]
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
        set :
            fields :
                id    : true
                output : true
            required_fields :
                id    : true
                output : true

schema.eval_outputs.project_query = schema.eval_outputs.user_query



