###############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
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


###
The schema below determines the PostgreSQL database schema.   The notation is as follows:

schema.table_name =
    desc: 'A description of this table.'   # will be used only for tooling
    primary_key : 'the_table_primary_key'
    durability :  'hard' or 'soft' # optional -- if given, specify the table durability; 'hard' is the default
    fields :   # every field *must* be listed here or user queries won't work.
        the_table_primary_key :
            type : 'uuid'
            desc : 'This is the primary key of the table.'
        ...
    pg_indexes : [array of column names]  # also some more complicated ways to define indexes; see the examples.
    user_query :  # queries that are directly exposed to the client via a friendly "fill in what result looks like" query language
        get :     # describes get query for reading data from this table
            pg_where :  # this gets run first on the table before
                      'account_id' - replaced by user's account_id
                      'project_id' - filled in by project_id, which must be specified in the query itself;
                                    (if table not anonymous then project_id must be a project that user has read access to)
                      'project_id-public' - filled in by project_id, which must be specified in the query itself;
                                    (if table not anonymous then project_id must be of a project with at east one public path)
                      'all_projects_read' - filled in with list of all the id's of projects this user has read access to
                      'collaborators' - filled in by account_id's of all collaborators of this user
                      an arbitrary function -  gets called with an object with these keys:
                             account_id, table, query, multi, options, changes
            fields :  # these are the fields any user is allowed to see, subject to the all constraint above
                field_name    : either null or a default_value
                another_field : 10   # means will default to 10 if undefined in database
                this_field    : null # no default filled in
                settings :
                     strip : false   # defaults for a field that is an object -- these get filled in if missing in db
                     wrap  : true
        set :     # describes more dangerous *set* queries that the user can make via the query language
            pg_where :   # initially restrict what user can set
                'account_id' - user account_id
                      - list of project_id's that the user has write access to
            fields :    # user must always give the primary key in set queries
                account_id : 'account_id'  # means that this field will automatically be filled in with account_id
                project_id : 'project_write' # means that this field *must* be a project_id that the user has *write* access to
                foo : true   # user is allowed (but not required) to set this
                bar : true   # means user is allowed to set this

To specify more than one user query against a table, make a new table as above, omitting
everything except the user_query section, and include a virtual section listing the actual
table to query:

    virtual : 'original_table'

For example,

schema.collaborators =
    primary_key : 'account_id'
    anonymous   : false
    virtual     : 'accounts'
    user_query:
        get : ...


Finally, putting

    anonymous : true

makes it so non-signed-in-users may query the table (read only) for data, e.g.,

schema.stats =
    primary_key: 'id'
    anonymous : true   # allow user access, even if not signed in
    fields:
        id                  : true
        ...

###

misc = require('./misc')

{DEFAULT_QUOTAS} = require('./upgrade-spec')

schema = exports.SCHEMA = {}

schema.account_creation_actions =
    desc : 'Actions to carry out when accounts are created, triggered by the email address of the user.'
    primary_key : 'id'
    fields :
        id :
            type : 'uuid'
        action        :
            type : 'map'
            desc : 'Describes the action to carry out when an account is created with the given email_address.'
        email_address :
            type : 'string'
            desc : 'Email address of user.'
        expire        :
            type : 'timestamp'
            desc : 'When this action should be expired.'
    pg_indexes : ['email_address']

schema.accounts =
    desc : 'All user accounts.'
    primary_key : 'account_id'
    fields :
        account_id      :
            type : 'uuid',
            desc : 'The uuid that determines the user account'
        created :
            type : 'timestamp'
            desc : 'When the account was created.'
        created_by :
            type : 'string'
            pg_type : 'inet'
            desc : 'IP address that created the account.'
        creation_actions_done :
            type : 'boolean'
            desc : 'Set to true after all creation actions (e.g., add to projects) associated to this account are succesfully completed.'
        password_hash :
            type : 'string'
            pg_type : 'VARCHAR(173)'
            desc : 'hash of the password'
        deleted :
            type : 'boolean'
            desc : "True if the account has been deleted."
        email_address :
            type : 'string'
            pg_type : "VARCHAR(254)"  # see http://stackoverflow.com/questions/386294/what-is-the-maximum-length-of-a-valid-email-address
            desc : 'The email address of the user.  This is optional, since users may instead be associated to passport logins.'
            unique : true  # only one record in database can have this email address (if given)
        email_address_before_delete :
            type : 'string'
            desc : 'The email address of the user before they deleted their account.'
        passports       :
            type : 'map'
            desc : 'Map from string ("[strategy]-[id]") derived from passport name and id to the corresponding profile'
        editor_settings :
            type : 'map'
            desc : 'Description of configuration settings for the editor.  See the user_query get defaults.'
        other_settings :
            type : 'map'
            desc : 'Miscellaneous overall configuration settings for SMC, e.g., confirm close on exit?'
        notifications :
            type : 'map'
            desc : 'User preferences for receiving notfications'
        first_name :
            type : 'string'
            pg_type : "VARCHAR(254)"  # some limit (actually around 3000) is required for indexing
            desc : 'The first name of this user.'
        last_name :
            type : 'string'
            pg_type : "VARCHAR(254)"
            desc : 'The last name of this user.'
        banned :
            type : 'boolean'
            desc : 'Whether or not this user is banned.'
        terminal :
            type : 'map'
            desc : 'Settings for the terminal, e.g., font_size, etc. (see get query)'
        autosave :
            type : 'integer'
            desc : 'File autosave interval in seconds'
        evaluate_key :
            type : 'string'
            desc : 'Key used to evaluate code in Sage worksheet.'
        font_size :
            type : 'integer'
            desc : 'Default font-size for the editor, jupyter, etc. (px)'
        last_active :
            type : 'timestamp'
            desc : 'When this user was last active.'
        stripe_customer_id :
            type : 'string'
            desc : 'The id of this customer in the stripe billing system.'
        stripe_customer :
            type : 'map'
            desc : 'Information about customer from the point of view of stripe (exactly what is returned by stripe.customers.retrieve).'
        coupon_history :
            type : 'map'
            desc : 'Information about which coupons the customer has used and the number of times'
        profile :
            type : 'map'
            desc : 'Information related to displaying this users location and presence in a document or chatroom.'
        groups :
            type : 'array'
            pg_type : 'TEXT[]'
            desc : "Array of groups that this user belongs to; usually empty.  The only group right now is 'admin', which grants admin rights."
        ssh_keys :
            type : 'map'
            desc : 'Map from ssh key fingerprints to ssh key objects.'
        api_key :
            type : 'string'
            desc : "Optional API key that grants full API access to anything this account can access. Key is of the form 'sk_9QabcrqJFy7JIhvAGih5c6Nb', where the random part is 24 characters (base 62)."
    pg_indexes : [
        '(lower(first_name) text_pattern_ops)',
        '(lower(last_name)  text_pattern_ops)',
        'created_by',
        'created',
        'api_key'
        ]
    user_query :
        get :
            throttle_changes : 500
            pg_where : ['account_id = $::UUID':'account_id']
            fields :
                account_id      : null
                email_address   : null
                editor_settings :
                    strip_trailing_whitespace : false
                    show_trailing_whitespace  : true
                    line_wrapping             : true
                    line_numbers              : true
                    smart_indent              : true
                    electric_chars            : true
                    match_brackets            : true
                    auto_close_brackets       : true
                    code_folding              : true
                    match_xml_tags            : true
                    auto_close_xml_tags       : true
                    spaces_instead_of_tabs    : true
                    multiple_cursors          : true
                    track_revisions           : true
                    extra_button_bar          : true
                    first_line_number         : 1
                    indent_unit               : 4
                    tab_size                  : 4
                    bindings                  : "standard"
                    theme                     : "default"
                    undo_depth                : 300
                    jupyter_classic           : false
                other_settings  :
                    confirm_close     : false
                    mask_files        : true
                    page_size         : 50
                    standby_timeout_m : 10
                    default_file_sort : 'time'
                    show_global_info2 : null
                notifications :
                    new_collaborators  : true
                first_name      : ''
                last_name       : ''
                terminal        :
                    font_size    : 14
                    color_scheme : 'default'
                    font         : 'monospace'
                autosave        : 45
                evaluate_key    : 'Shift-Enter'
                font_size       : 14
                passports       : {}
                groups          : []
                last_active     : null
                stripe_customer : null
                coupon_history  : null
                profile :
                    image       : undefined
                    color       : undefined
                ssh_keys        : {}
        set :
            fields :
                account_id      : 'account_id'
                editor_settings : true
                other_settings  : true
                notifications   : true
                first_name      : true
                last_name       : true
                terminal        : true
                autosave        : true
                evaluate_key    : true
                font_size       : true
                profile         : true
                ssh_keys        : true
            check_hook : (db, obj, account_id, project_id, cb) ->
                # Hook to truncate some text fields to at most 254 characters, to avoid
                # further trouble down the line.
                for field in ['first_name', 'last_name', 'email_address']
                    if obj[field]?
                        obj[field] = obj[field].slice(0,254)
                cb()


schema.blobs =
    desc : 'Table that stores blobs mainly generated as output of Sage worksheets.'
    primary_key : 'id'
    fields :
        id     :
            type : 'uuid'
            desc : 'The uuid of this blob, which is a uuid derived from the Sha1 hash of the blob content.'
        blob   :
            type : 'Buffer'
            desc : 'The actual blob content'
        expire :
            type : 'timestamp'
            desc : 'When to expire this blob (when delete_expired is called on the database).'
        created :
            type : 'timestamp'
            desc : 'When the blob was created.'
        project_id :
            type : 'string'
            desc : 'The uuid of the project that created the blob.'
        last_active :
            type : 'timestamp'
            desc : 'When the blob was last pulled from the database.'
        count :
            type : 'number'
            desc : 'How many times the blob has been pulled from the database.'
        size :
            type : 'number'
            desc : 'The size in bytes of the blob.'
        gcloud :
            type : 'string'
            desc : 'name of a bucket that contains the actual blob, if available.'
        backup :
            type : 'boolean'
            desc : 'if true, then this blob was saved to an offsite backup'
        compress :
            type : 'string'
            desc : "optional compression used: 'gzip', 'zlib', 'snappy'"
    user_query :
        get :
            instead_of_query : (database, obj, account_id, cb) ->
                if not obj.id?
                    cb("id must be specified")
                    return
                database.get_blob
                    uuid : obj.id
                    cb   : (err, blob) ->
                        if err
                            cb(err)
                        else
                            cb(undefined, {id:obj.id, blob:blob})
            fields :
                id          : null
                blob        : null
        set :
            fields :
                id          : true
                blob        : true
                project_id  : 'project_write'
                ttl         : 0
            required_fields :
                id          : true
                blob        : true
                project_id  : true
            instead_of_change : (database, old_val, new_val, account_id, cb) ->
                database.save_blob
                    uuid       : new_val.id
                    blob       : new_val.blob
                    ttl        : new_val.ttl
                    project_id : new_val.project_id
                    check      : true  # can't trust the user!
                    cb         : cb

schema.central_log =
    desc : 'Table for logging system stuff that happens.  Meant to help in running and understanding the system better.'
    primary_key : 'id'
    durability : 'soft' # loss of some log data not serious, since used only for analytics
    fields :
        id    :
            type : 'uuid'
        event :
            type : 'string'
        value :
            type : 'map'
        time  :
            type : 'timestamp'
    pg_indexes : ['time', 'event']

schema.client_error_log =
    primary_key : 'id'
    durability : 'soft' # loss of some log data not serious, since used only for analytics
    fields:
        id         :
            type : 'uuid'
        event      :
            type : 'string'
        error      :
            type : 'string'
        account_id :
            type : 'uuid'
        time       :
            type : 'timestamp'
    pg_indexes : ['time', 'event']

schema.webapp_errors =
    primary_key : 'id'
    durability : 'soft' # loss of some log data not serious, since used only for analytics
    fields:
        id           : type : 'uuid'
        account_id   : type : 'uuid'
        name         : type : 'string'
        message      : type : 'string'
        comment      : type : 'string'
        stacktrace   : type : 'string'
        file         : type : 'string'
        path         : type : 'string'
        lineNumber   : type : 'integer'
        columnNumber : type : 'integer'
        severity     : type : 'string'
        browser      : type : 'string'
        mobile       : type : 'boolean'
        responsive   : type : 'boolean'
        user_agent   : type : 'string'
        path         : type : 'text'
        smc_version  : type : 'string'
        build_date   : type : 'string'
        smc_git_rev  : type : 'string'
        uptime       : type : 'string'
        start_time   : type : 'timestamp'
        time         : type : 'timestamp'
    pg_indexes : ['time', 'name', 'account_id', 'smc_git_rev', 'smc_version', 'start_time', 'browser']

schema.collaborators =
    primary_key : 'account_id'
    anonymous   : false
    virtual     : 'accounts'
    user_query:
        get :
            pg_where : ["account_id = ANY(SELECT DISTINCT jsonb_object_keys(users)::UUID FROM projects WHERE users ? $::TEXT)": 'account_id']
            pg_changefeed : 'collaborators'
            fields :
                account_id  : null
                first_name  : ''
                last_name   : ''
                last_active : null
                profile     : null

schema.compute_servers =
    primary_key : 'host'
    fields :
        host         :
            type : 'string'
            pg_type : 'VARCHAR(63)'
        dc           :
            type : 'string'
        port         :
            type : 'integer'
        secret       :
            type : 'string'
        experimental :
            type : 'boolean'
        member_host  :
            type : 'boolean'
        status       :
            type : 'map'
            desc : 'something like {stuff:?,...,timestamp:?}'
            date : ['timestamp']

schema.file_access_log =
    primary_key : 'id'
    durability : 'soft' # loss of some log data not serious, since used only for analytics
    fields:
        id         :
            type : 'uuid'
        project_id :
            type : 'uuid'
        account_id :
            type : 'uuid'
        filename   :
            type : 'string'
        time       :
            type : 'timestamp'
    pg_indexes : ['project_id', 'account_id', 'filename', 'time']

# TODO: for postgres rewrite after done we MIGHT completely redo file_use to eliminate
# the id field, use project_id, path as a compound primary key, and maybe put users in
# another table with a relation.  There is also expert discussion about this table in the
# Hacker News discussion of my PostgreSQL vs ... blog post.
schema.file_use =
    primary_key: 'id'
    durability : 'soft' # loss of some log data not serious, since used only for showing notifications
    unique_writes: true   # there is no reason for a user to write the same record twice
    fields:
        id          :
            type : 'string'
            pg_type : 'CHAR(40)'
        project_id  :
            type : 'uuid'
        path        :
            type : 'string'
        users       :
            type : 'map'
            desc : '{account_id1: {action1: timestamp1, action2:timestamp2}, account_id2: {...}}'
            date : 'all'
        last_edited :
            type : 'timestamp'

    pg_indexes : ['project_id', 'last_edited']

    user_query:
        get :
            pg_where : ['projects', 'last_edited IS NOT NULL']
            pg_changefeed: 'projects'
            options : [{order_by : '-last_edited'}, {limit : 100}]  # limit is kind of arbitrary; not sure what to do; I benchmarked 100 vs 200 on myself, and 100 is much faster.
            throttle_changes : 3000
            fields :
                id          : null
                project_id  : null
                path        : null
                users       : null
                last_edited : null
        set :
            fields :
                id          : (obj, db) -> db.sha1(obj.project_id, obj.path)
                project_id  : 'project_write'
                path        : true
                users       : true
                last_edited : true
            required_fields :
                id          : true
                project_id  : true
                path        : true
            check_hook : (db, obj, account_id, project_id, cb) ->
                # hook to note that project is being used (CRITICAL: do not pass path
                # into db.touch since that would cause another write to the file_use table!)
                # CRITICAL: Only do this if what edit or chat for this user is very recent.
                # Otherwise we touch the project just for seeing notifications or opening
                # the file, which is confusing and wastes a lot of resources.
                x = obj.users?[account_id]
                recent = misc.minutes_ago(3)
                if x? and (x.edit >= recent or x.chat >= recent)
                    db.touch(project_id:obj.project_id, account_id:account_id)
                cb?()

schema.hub_servers =
    primary_key : 'host'
    durability : 'soft' # loss of some log data not serious, since ephemeral and expires quickly anyways
    fields:
        host :
            type : 'string'
            pg_type : 'VARCHAR(63)'
        port :
            type : 'integer'
        clients :
            type : 'integer'
        expire :
            type : 'timestamp'

schema.instances =
    primary_key: 'name'
    fields:
        name                  :
            type : 'string'
        gce                   :
            type : 'map'
        gce_sha1              :
            type : 'string'
        requested_preemptible :
            type : 'boolean'
        requested_status      :
            type : 'string'
            desc : "One of 'RUNNING', 'TERMINATED'"
        action                :
            type : 'map'
            desc : "{action:'start', started:timestamp, finished:timestamp,  params:?, error:?, rule:?}"
            date : ['started', 'finished']

schema.instance_actions_log =
    primary_key: 'id'
    fields:
        id        :
            type : 'uuid'
        name      :
            type : 'string'
            desc : 'hostname of vm'
            pg_type : 'VARCHAR(63)'
        action    :
            type : 'map'
            desc : 'same as finished action object for instances above'
            date : ['started', 'finished']

schema.passport_settings =
    primary_key:'strategy'
    fields:
        strategy :
            type : 'string'
        conf     :
            type : 'map'

schema.password_reset =
    primary_key: 'id'
    fields:
        id :
            type : 'uuid'
        email_address :
            type : 'string'
        expire        :
            type : 'timestamp'

schema.password_reset_attempts =
    primary_key: 'id'
    durability : 'soft' # loss not serious, since used only for analytics and preventing attacks
    fields:
        id :
            type : 'uuid'
        email_address :
            type : 'string'
        ip_address    :
            type    : 'string'
            pg_type : 'inet'
        time          :
            type : 'timestamp'
    pg_indexes: ['time']

schema.project_log =
    primary_key: 'id'
    durability : 'soft' # dropping a log entry (e.g., "foo opened a file") wouldn't matter much
    fields :
        id          :
            type : 'uuid'
            desc : 'which'
        project_id  :
            type : 'uuid'
            desc : 'where'
        time        :
            type : 'timestamp'
            desc : 'when'
        account_id  :
            type : 'uuid'
            desc : 'who'
        event       :
            type : 'map'
            desc : 'what'

    pg_indexes : ['project_id', 'time']


    user_query:
        get :
            pg_where     : 'projects'
            pg_changefeed: 'projects'
            options   : [{order_by : '-time'}, {limit : 1000}]
            throttle_changes : 2000
            fields :
                id          : null
                project_id  : null
                time        : null
                account_id  : null
                event       : null
        set :
            fields :
                id         : (obj) -> obj.id ? misc.uuid()
                project_id : 'project_write'
                account_id : 'account_id'
                time       : true
                event      : true

schema.projects =
    primary_key: 'project_id'
    fields :
        project_id  :
            type : 'uuid',
            desc : 'The project id, which is the primary key that determines the project.'
        title       :
            type : 'string'
            desc : 'The short title of the project. Should use no special formatting, except hashtags.'
        description :
            type : 'string'
            desc : 'A longer textual description of the project.  This can include hashtags and should be formatted using markdown.'  # markdown rendering possibly not implemented
        users       :
            type : 'map'
            desc : "This is a map from account_id's to {hide:bool, group:['owner',...], upgrades:{memory:1000, ...}, ssh:{...}}."
        invite      :
            type : 'map'
            desc : "Map from email addresses to {time:when invite sent, error:error message if there was one}"
            date : ['time']
        invite_requests :
            type : 'map'
            desc : "This is a map from account_id's to {timestamp:?, message:'i want to join because...'}."
            date : ['timestamp']
        deleted     :
            type : 'boolean'
            desc : 'Whether or not this project is deleted.'
        host        :
            type : 'map'
            desc : "This is a map {host:'hostname_of_server', assigned:timestamp of when assigned to that server}."
            date : ['assigned']
        settings    :
            type : 'map'
            desc : 'This is a map that defines the free base quotas that a project has. It is of the form {cores: 1.5, cpu_shares: 768, disk_quota: 1000, memory: 2000, mintime: 36000000, network: 0}.  WARNING: some of the values are strings not numbers in the database right now, e.g., disk_quota:"1000".'
        status      :
            type : 'map'
            desc : 'This is a map computed by the status command run inside a project, and slightly enhanced by the compute server, which gives extensive status information about a project.  It has the form {console_server.pid: [pid of the console server, if running], console_server.port: [port if it is serving], disk_MB: [MB of used disk], installed: [whether code is installed], local_hub.pid: [pid of local hub server process],  local_hub.port: [port of local hub process], memory: {count:?, pss:?, rss:?, swap:?, uss:?} [output by smem],  raw.port: [port that the raw server is serving on], sage_server.pid: [pid of sage server process], sage_server.port: [port of the sage server], secret_token: [long random secret token that is needed to communicate with local_hub], state: "running" [see COMPUTE_STATES below], version: [version number of local_hub code]}'
        state       :
            type : 'map'
            desc : 'Info about the state of this project of the form  {error: "", state: "running", time: timestamp}, where time is when the state was last computed.  See COMPUTE_STATES below.'
            date : ['time']
        last_edited :
            type : 'timestamp'
            desc : 'The last time some file was edited in this project.  This is the last time that the file_use table was updated for this project.'
        last_started :
            type : 'timestamp'
            desc : 'The last time the project started running.'
        last_active :
            type : 'map'
            desc : "Map from account_id's to the timestamp of when the user with that account_id touched this project."
            date : 'all'
        created :
            type : 'timestamp'
            desc : 'When the project was created.'
        action_request :
            type : 'map'
            desc : "Request state change action for project: {action:['restart', 'stop', 'save', 'close'], started:timestamp, err:?, finished:timestamp}"
            date : ['started', 'finished']
        storage :
            type : 'map'
            desc : "This is a map {host:'hostname_of_server', assigned:when first saved here, saved:when last saved here}."
            date : ['assigned', 'saved']
        last_backup :
            type : 'timestamp'
            desc : "(DEPRECATED) Timestamp of last off-disk successful backup using bup to Google cloud storage"
        storage_request :
            type : 'map'
            desc : "(DEPRECATED) {action:['save', 'close', 'move', 'open'], requested:timestap, pid:?, target:?, started:timestamp, finished:timestamp, err:?}"
            date : ['started', 'finished', 'requested']
        course :
            type : 'map'
            desc : '{project_id:[id of project that contains .course file], path:[path to .course file], pay:?, email_address:[optional email address of student -- used if account_id not known], account_id:[account id of student]}, where pay is either not set (or equals falseish) or is a timestamp by which the students must move the project to a members only server.'
            date : ['pay']
        storage_server :
            type : 'integer'
            desc : '(DEPRECATED) Number of the Kubernetes storage server with the data for this project: one of 0, 1, 2, ...'
        storage_ready :
            type : 'boolean'
            desc : '(DEPRECATED) Whether storage is ready to be used on the storage server.  Do NOT try to start project until true; this gets set by storage daemon when it notices the that run is true.'
        disk_size :
            type : 'integer'
            desc : 'Size in megabytes of the project disk.'
        resources :
            type : 'map'
            desc : 'Object of the form {requests:{memory:"30Mi",cpu:"5m"}, limits:{memory:"100Mi",cpu:"300m"}} which is passed to the k8s resources section for this pod.'
        preemptible :
            type : 'boolean'
            desc : 'If true, allow to run on preemptible nodes.'
        idle_timeout :
            type : 'integer'
            desc : 'If given and nonzero, project will be killed if it is idle for this many **minutes**, where idle *means* that last_edited has not been updated.'
        run_quota :
            type : 'map'
            desc : 'If project is running, this is the quota that it is running with.'

    pg_indexes : [
        'last_edited',
        'USING GIN (users)'               # so get_collaborator_ids is fast
        'USING GIN (host jsonb_path_ops)' # so get_projects_on_compute_server is fast
    ]

    user_query:
        get :
            pg_where     : 'projects'
            pg_changefeed: 'projects'
            throttle_changes : 2000
            fields :
                project_id     : null
                title          : ''
                description    : ''
                users          : {}
                invite         : null   # who has been invited to this project via email
                invite_requests: null   # who has requested to be invited
                deleted        : null
                host           : null
                settings       : DEFAULT_QUOTAS
                status         : null
                state          : null
                last_edited    : null
                last_active    : null
                action_request : null   # last requested action -- {action:?, time:?, started:?, finished:?, err:?}
                course         : null
        set :
            fields :
                project_id     : 'project_write'
                title          : true
                description    : true
                deleted        : true
                invite_requests: true   # project collabs can modify this (e.g., to remove from it once user added or rejected)
                users          : (obj, db, account_id) -> db._user_set_query_project_users(obj, account_id)
                action_request : true   # used to request that an action be performed, e.g., "save"; handled by before_change

            before_change : (database, old_val, new_val, account_id, cb) ->
                database._user_set_query_project_change_before(old_val, new_val, account_id, cb)

            on_change : (database, old_val, new_val, account_id, cb) ->
                database._user_set_query_project_change_after(old_val, new_val, account_id, cb)

    project_query:
        get :
            pg_where : ["project_id = $::UUID" : 'project_id']
            fields :
                project_id     : null
                title          : null
                description    : null
                status         : null
        set :
            fields :
                project_id     : 'project_id'
                title          : true
                description    : true
                status         : true

# Table that enables set queries to the course field of a project.  Only
# project owners are allowed to use this table.  The point is that this makes
# it possible for the owner of the project to set things, but not for the
# collaborators to set those things.
schema.projects_owner =
    virtual : 'projects'
    fields :
        project_id : true
        course     : true
    user_query :
        set :
            fields :
                project_id : 'project_owner'
                course     : true

# Table that enables any signed-in user to set an invite request.
# Later: we can make an index so that users can see all outstanding requests they have made easily.
# How to test this from the browser console:
#    project_id = '4e0f5bfd-3f1b-4d7b-9dff-456dcf8725b8' // id of a project you have
#    invite_requests = {}; invite_requests[smc.client.account_id] = {timestamp:new Date(), message:'please invite me'}
#    smc.client.query({cb:console.log, query:{project_invite_requests:{project_id:project_id, invite_requests:invite_requests}}})  // set it
#    smc.redux.getStore('projects').get_project(project_id).invite_requests                 // see requests for this project
#
# CURRENTLY NOT USED.
schema.project_invite_requests =
    virtual    : 'projects'
    primary_key: 'project_id'
    fields :
        project_id      : true
        invite_requests : true   # {account_id:{timestamp:?, message:?}, ...}
    user_query :
        set :
            fields :
                project_id      : true
                invite_requests : true
            before_change : (database, old_val, new_val, account_id, cb) ->
                cb()  # actual function will be database._user... as below.
                #database._user_set_query_project_invite_requests(old_val, new_val, account_id, cb)
                # For now don't check anything -- this is how we will make it secure later.
                # This will:
                #   - that user setting this is signed in
                #   - ensure user only modifies their own entry (for their own id).
                #   - enforce some hard limit on number of outstanding invites (say 30).
                #   - enforce limit on size of invite message.
                #   - sanity check on timestamp
                #   - with an index as mentioned above we could limit the number of projects
                #     to which a single user has requested to be invited.

# Table that provides extended read info about a single project
# but *ONLY* for admin.
schema.projects_admin =
    primary_key : schema.projects.primary_key
    virtual     : 'projects'
    fields      : schema.projects.fields
    user_query:
        get :
            admin  : true   # only admins can do get queries on this table
                            # (without this, users who have read access could read)
            pg_where : ['project_id = $::UUID':'project_id']
            fields : schema.projects.user_query.get.fields

# Get publicly available information about a project.
#
schema.public_projects =
    anonymous : true
    virtual   : 'projects'
    user_query :
        get :
            pg_where : ['project_id = $::UUID':'project_id-public']
            fields :
                project_id  : true
                title       : true
                description : true

schema.public_paths =
    primary_key : 'id'
    anonymous   : true   # allow user *read* access, even if not signed in
    fields:
        id          :
            type : 'string'
            pg_type : 'CHAR(40)'
            desc : 'sha1 hash derived from project_id and path'
        project_id  :
            type : 'uuid'
        path        :
            type : 'string'
        description :
            type : 'string'
        disabled    :
            type : 'boolean'
            desc : 'if true then disabled'
        created :
            type : 'timestamp'
            desc : 'when this path was created'
        last_edited :
            type : 'timestamp'
            desc : 'when this path was last edited'
        last_saved :
            type : 'timestamp'
            desc : 'when this path was last saved (or deleted if disabled) by manage-storage'
        counter :
            type : 'number'
            desc : 'the number of times this public path has been accessed'

    pg_indexes : ['project_id']

    user_query:
        get :
            pg_where : ["project_id = $::UUID": 'project_id']
            throttle_changes : 2000
            fields :
                id          : null
                project_id  : null
                path        : null
                description : null
                disabled    : null   # if true then disabled
                last_edited : null
                created     : null
                last_saved  : null
                counter     : null
        set :
            fields :
                id          : (obj, db) -> db.sha1(obj.project_id, obj.path)
                project_id  : 'project_write'
                path        : true
                description : true
                disabled    : true
                last_edited : true
                created     : true
            required_fields :
                id          : true
                project_id  : true
                path        : true


schema.public_paths.project_query = misc.deep_copy(schema.public_paths.user_query)

###
Requests and status related to copying files between projects.
###
schema.copy_paths =
    primary_key : 'id'
    fields:
        id                 :
            type : 'uuid'
            desc : 'random unique id assigned to this copy request'
        time               :
            type : 'timestamp'
            desc : 'when this request was made'
        source_project_id  :
            type : 'uuid'
            desc : 'the project_id of the source project'
        source_path        :
            type : 'string'
            desc : 'the path of the source file or directory'
        target_project_id  :
            type : 'uuid'
            desc : 'the project_id of the target project'
        target_path        :
            type : 'string'
            desc : 'the path of the target file or directory'
        overwrite_newer    :
            type : 'boolean'
            desc : 'if new, overwrite newer files in destination'
        delete_missing     :
            type : 'boolean'
            desc : "if true, delete files in the target that aren't in the source path"
        backup             :
            type : 'boolean'
            desc : 'if true, make backup of files before overwriting'
        bwlimit            :
            type : 'string'
            desc : 'optional limit on the bandwidth dedicated to this copy (passed to rsync)'
        timeout            :
            type : 'number'
            desc : 'fail if the transfer itself takes longer than this number of seconds (passed to rsync)'
        started :
            type : 'timestamp'
            desc : 'when the copy request actually started running'
        finished :
            type : 'timestamp'
            desc : 'when the copy request finished'
        error :
            type : 'string'
            desc : 'if the copy failed or output any errors, they are put here.'
    pg_indexes : ['time']
    # TODO: for now there are no user queries -- this is used entirely by backend servers,
    # actually only in kucalc; later that may change, so the user can make copy
    # requests this way, check on their status, show all current copies they are
    # causing in a page (that is persistent over browser refreshes, etc.).
    # That's for later.


schema.remember_me =
    primary_key : 'hash'
    durability  : 'soft' # dropping this would just require a user to login again
    fields :
        hash       :
            type : 'string'
            pg_type : 'CHAR(127)'
        value      :
            type : 'map'
        account_id :
            type : 'uuid'
        expire     :
            type : 'timestamp'
    pg_indexes : ['account_id']

schema.auth_tokens =
    primary_key : 'auth_token'
    fields :
        auth_token   :
            type    : 'string'
            pg_type : 'CHAR(24)'
        account_id :
            type : 'uuid'
        expire     :
            type : 'timestamp'

schema.server_settings =
    primary_key : 'name'
    anonymous   : false
    fields :
        name  :
            type : 'string'
        value :
            type : 'string'
    user_query:
        # NOTE: can *set* but cannot get!
        set:
            admin : true
            fields:
                name  : null
                value : null

# Default settings to customize a given site, typically a private install of SMC.
exports.site_settings_conf =
    site_name:
        name    : "Site name"
        desc    : "The heading name of your site."
        default : "CoCalc"
    site_description:
        name    : "Site description"
        desc    : "The description of your site."
        default : ""
    terms_of_service:
        name    : "Terms of service link text"
        desc    : "The text displayed for the terms of service link (make empty to not require)."
        default : 'By signing up you agree to our <a target="_blank" href="/policies/terms.html">Terms of Service</a>.'
    account_creation_email_instructions:
        name    : 'Account creation instructions'
        desc    : "Instructions displayed next to the box where a user creates their account using their name and email address."
        default : 'Create an Account'
    help_email:
        name    : "Help email address"
        desc    : "Email address that user is directed to use for support requests"
        default : "help@sagemath.com"
    commercial:
        name    : "Commercial UI elements ('yes' or 'no')"
        desc    : "Whether or not to include user interface elements related to for-pay upgrades and features.  Set to 'yes' to include these elements."
        default : "no"
    kucalc:
        name    : "KuCalc UI elements ('yes' or 'no')"
        desc    : "Whether to show UI elements adapted to what the KuCalc backend provides"
        default : "no"  # TODO -- this will *default* to yes when run from kucalc; but site admin can set it either way anywhere for testing.


site_settings_fields = misc.keys(exports.site_settings_conf)

schema.site_settings =
    virtual   : 'server_settings'
    anonymous : false
    user_query:
        # NOTE: can set and get only fields in site_settings_fields, but not any others.
        get:
            pg_where: ['name = ANY($)': site_settings_fields]
            admin  : true
            fields :
                name  : null
                value : null
        set:
            admin : true
            fields:
                name  : (obj, db) ->
                    if obj.name in site_settings_fields
                        return obj.name
                    throw Error("setting name='#{obj.name}' not allowed")
                value : null

schema.stats =
    primary_key : 'id'
    durability  : 'soft' # ephemeral stats whose slight loss wouldn't matter much
    anonymous   : true     # allow user read access, even if not signed in
    fields:
        id                  :
            type : 'uuid'
        time                :
            type : 'timestamp'
            pg_check : 'NOT NULL'
        accounts            :
            type : 'integer'
            pg_check : 'NOT NULL CHECK (accounts >= 0)'
        accounts_created    :
            type : 'map'
        files_opened :
            type : 'map'
        projects            :
            type : 'integer'
            pg_check : 'NOT NULL CHECK (projects >= 0)'
        projects_created    :
            type : 'map'
        projects_edited     :
            type : 'map'
        hub_servers         :
            type : 'array'
            pg_type : 'JSONB[]'
    pg_indexes : ['time']
    user_query:
        get:
            pg_where: ["time >= NOW() - INTERVAL '5 minutes'"]
            pg_changefeed : 'five-minutes'
            options : [{'order_by':'-time'}]
            throttle_changes : 5000
            fields :
                id                  : null
                time                : null
                accounts            : 0
                accounts_created    : null
                projects            : 0
                projects_created    : null
                projects_edited     : null
                hub_servers         : []

schema.storage_servers =
    primary_key : 'host'
    fields :
        host :
            type    : 'string'
            desc    : 'hostname of the storage server'
            pg_type : 'VARCHAR(63)'

schema.system_notifications =
    primary_key : 'id'
    anonymous   : true     # allow users read access, even if not signed in
    fields :
        id :
            type : 'uuid'
            desc : 'primary key'
        time :
            type : 'timestamp'
            desc : 'time of this message'
        text :
            type : 'string'
            desc : 'the text of the message'
        priority:
            type : 'string'
            pg_type : 'VARCHAR(6)'
            desc : 'one of "low", "medium", or "high"'
        done:
            type : 'boolean'
            desc : 'if true, then this notification is no longer relevant'
    user_query:
        get:
            pg_where: ["time >= NOW() - INTERVAL '1 hour'"]
            pg_changefeed : 'one-hour'
            throttle_changes : 3000
            fields :
                id       : null
                time     : null
                text     : ''
                priority : 'low'
                done     : false
        set:
            admin : true
            fields:
                id       : true
                time     : true
                text     : true
                priority : true
                done     : true


# Client side versions of some db functions, which are used, e.g., when setting fields.
sha1 = require('sha1')
class ClientDB
    constructor: ->
        @r = {}

    sha1: (args...) =>
        v = ((if typeof(x) == 'string' then x else JSON.stringify(x)) for x in args).join('')
        return sha1(v)

    _user_set_query_project_users: (obj) =>
        # client allows anything; server may be more stringent
        return obj.users

    _user_set_query_project_change_after: (obj, old_val, new_val, cb) =>
        cb()
    _user_set_query_project_change_before: (obj, old_val, new_val, cb) =>
        cb()

    primary_keys: (table) =>
        @_primary_keys_cache ?= {}
        if @_primary_keys_cache[table]?
            return @_primary_keys_cache[table]
        t = schema[table]
        if t.virtual?
            t = schema[t.virtual]
        v = t?.primary_key
        if not v?
            throw Error("primary key for table '#{table}' must be explicitly specified in schema")
        if typeof(v) == 'string'
            return @_primary_keys_cache[table] = [v]
        else if misc.is_array(v)
            if v.length == 0
                throw Error("at least one primary key must specified")
            return @_primary_keys_cache[table] = v
        else
            throw Error("primary key must be a string or array of strings")


exports.client_db = new ClientDB()

