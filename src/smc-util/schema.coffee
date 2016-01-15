###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, William Stein
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

misc = require('./misc')

# these are the base quotas
exports.DEFAULT_QUOTAS = DEFAULT_QUOTAS =
    disk_quota  : 3000
    cores       : 1
    memory      : 1000
    cpu_shares  : 256
    mintime     : 3600   # hour
    network     : 0
    member_host : 0

schema = exports.SCHEMA = {}

###
The schema below determines the RethinkDB-based database structure.   The notation is as follows:

schema.table_name =
    desc: 'A description of this table.'   # will be used only for tooling
    primary_key : 'the_table_primary_key'
    fields :   # every field *must* be listed here or user queries won't work.
        the_table_primary_key :
            type : 'uuid'
            desc : 'This is the primary key of the table.'
        ...
    indexes :  # description of the indexes, mapping from index name to args that get passed to rethinkdb comand.
        index_name : [list of args that define this index]
    user_query :  # queries that are directly exposed to the client via a friendly "fill in what result looks like" query language
        get :     # describes get query for reading data from this table
            all :  # this gets run first on the table before
                cmd  : 'getAll'
                args : ['account_id']    # special args that get filled in:
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
            all :   # initially restrict what user can set
                cmd  : 'getAll'  # typically use this
                args : ['account_id']  # special args that filled in:
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

schema.account_creation_actions =
    desc : 'Actions to carry out when accounts are created, triggered by the email address of the user.'
    primary_key : 'id'
    fields :
        action        :
            type : 'map'
            desc : 'Describes the action to carry out when an account is created with the given email_address.'
        email_address :
            type : 'string'
            desc : 'Email address of user.'
        expire        :
            type : 'timestamp'
            desc : 'When this action should be expired.'
    indexes :
        email_address : ["[that.r.row('email_address'), that.r.row('expire')]"]
        expire        : []  # only used by delete_expired

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
        email_address   :
            type : 'string'
            desc : 'The email address of the user.  This is optional, since users may instead be associated to passport logins.'
        passports       :
            type : 'map'
            desc : 'Map from string ("[strategy]-[id]") derived from passport name and id to the corresponding profile'
        editor_settings :
            type : 'map'
            desc : 'Description of configuration settings for the editor.  See the user_query get defaults.'
        other_settings :
            type : 'map'
            desc : 'Miscellaneous overall configuration settings for SMC, e.g., confirm close on exit?'
        first_name :
            type : 'string'
            desc : 'The first name of this user.'
        last_name :
            type : 'string'
            desc : 'The last name of this user.'
        terminal :
            type : 'map'
            desc : 'Settings for the terminal, e.g., font_size, etc. (see get query)'
        autosave :
            type : 'number'
            desc : 'File autosave interval in seconds'
        evaluate_key :
            type : 'string'
            desc : 'Key used to evaluate code in Sage worksheet.'
        last_active :
            type : 'timestamp'
            desc : 'When this user was last active.'
        stripe_customer_id :
            type : 'string'
            desc : 'The id of this customer in the stripe billing system.'
        stripe_customer :
            type : 'map'
            desc : 'Information about customer from the point of view of stripe (exactly what is returned by stripe.customers.retrieve).'
        profile :
            type : 'map'
            desc : 'Information related to displaying this users location and presence in a document or chatroom.'
    indexes :
        passports     : ["that.r.row('passports').keys()", {multi:true}]
        created_by    : ["[that.r.row('created_by'), that.r.row('created')]"]
        email_address : []
    user_query :
        get :
            all :
                cmd  : 'getAll'
                args : ['account_id']
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
                other_settings  :
                    confirm_close     : false
                    mask_files        : true
                    page_size         : 50
                    default_file_sort : 'time'
                first_name      : ''
                last_name       : ''
                terminal        :
                    font_size    : 14
                    color_scheme : 'default'
                    font         : 'monospace'
                autosave        : 45
                evaluate_key    : 'Shift-Enter'
                passports       : {}
                groups          : []
                last_active     : null
                stripe_customer : null
                profile :
                    image       : undefined
                    color       : undefined
        set :
            all :
                cmd  : 'getAll'
                args : ['account_id']
            fields :
                account_id      : 'account_id'
                editor_settings : true
                other_settings  : true
                first_name      : true
                last_name       : true
                terminal        : true
                autosave        : true
                evaluate_key    : true
                profile         : true

schema.blobs =
    desc : 'Table that stores blobs mainly generated as output of Sage worksheets.'
    primary_key : 'id'
    fields :
        id     :
            type : 'string'
            desc : 'The uuid of this blob, which is a uuid derived from the Sha1 hash of the blob content.'
        blob   :
            type : 'Buffer'
            desc : 'The actual blob content'
        ttl    :
            type : 'number'
            desc : 'Number of seconds that the blob will live or 0 to make it never expire.'
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
    indexes:
        expire : []

schema.central_log =
    desc : 'Table for logging system stuff that happens.  Meant to help in running and understanding the system better.'
    primary_key : 'id'
    fields :
        id    : true
        event : true
        value : true
        time  : true
    indexes:
        time  : []
        event : []

schema.client_error_log =
    primary_key : 'id'
    fields:
        id         : true
        event      : true
        error      : true
        account_id : true
        time       : true
    indexes:
        time : []
        event : []

schema.collaborators =
    primary_key : 'account_id'
    anonymous   : false
    virtual     : 'accounts'
    user_query:
        get :
            all :
                method : 'getAll'
                args   : ['collaborators']
            fields :
                account_id  : null
                first_name  : ''
                last_name   : ''
                last_active : null
                profile     : null

schema.compute_servers =
    primary_key : 'host'
    fields :
        host         : true
        dc           : true
        port         : true
        secret       : true
        experimental : true
        member_host  : true
        status       : true   # map {stuff:?,...,timestamp:?}

schema.file_access_log =
    primary_key : 'id'
    fields:
        id         : true
        project_id : true
        account_id : true
        filename   : true
        time       : true
    indexes:
        project_id : []
        time       : []

schema.file_use =
    primary_key: 'id'
    fields:
        id          : true
        project_id  : true
        path        : true
        users       : true
        last_edited : true
    indexes:
        project_id                    : []
        last_edited                   : []
        'project_id-path'             : ["[that.r.row('project_id'), that.r.row('path')]"]
        'project_id-path-last_edited' : ["[that.r.row('project_id'), that.r.row('path'), that.r.row('last_edited')]"]
        'project_id-last_edited'      : ["[that.r.row('project_id'), that.r.row('last_edited')]"]
    user_query:
        get :
            all :
                cmd     : 'getAll'
                args    : ['all_projects_read', index:'project_id']
                options : [{order_by : '-last_edited'}, {limit : 150}]  # limit is kind of arbitrary; not sure what to do.
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

schema.hub_servers =
    primary_key : 'host'
    fields:
        expire : true
    indexes:
        expire : []

schema.instances =
    primary_key: 'name'
    fields:
        name                  : true
        gce                   : true
        gce_sha1              : true
        requested_preemptible : true  # true or false
        requested_status      : true  # 'RUNNING', 'TERMINATED'
        action                : true  # {action:'start', started:timestamp, finished:timestamp,  params:?, error:?, rule:?}

schema.instance_actions_log =
    primary_key: 'id'
    fields:
        id        : true
        name      : true  # hostname of vm
        action    : true  # same as finished action object for instances above

schema.passport_settings =
    primary_key:'strategy'
    fields:
        strategy : true
        conf     : true

schema.password_reset =
    primary_key: 'id'
    fields:
        email_address : true
        expire        : true
    indexes:
        expire : []  # only used by delete_expired

schema.password_reset_attempts =
    primary_key: 'id'
    fields:
        email_address : true
        ip_address    : true
        time          : true
    indexes:
        email_address : ["[that.r.row('email_address'),that.r.row('time')]"]
        ip_address    : ["[that.r.row('ip_address'),that.r.row('time')]"]
        time          : []

schema.project_log =
    primary_key: 'id'

    fields :
        id          : true  # which
        project_id  : true  # where
        time        : true  # when
        account_id  : true  # who
        event       : true  # what

    indexes:
        project_id        : []
        'project_id-time' : ["[that.r.row('project_id'), that.r.row('time')]"]

    user_query:
        get :
            all:
                cmd   : 'getAll'
                args  : ['project_id', index:'project_id']
            fields :
                id          : null
                project_id  : null
                time        : null
                account_id  : null
                event       : null
        set :
            fields :
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
            desc : "This is a map from account_id's to {hide:bool, group:['owner',...], upgrades:{memory:1000, ...}}."
        invite      :
            type : 'map'
            desc : "Map from email addresses to {time:when invite sent, error:error message if there was one}"
        deleted     :
            type : 'bool'
            desc : 'Whether or not this project is deleted.'
        host        :
            type : 'map'
            desc : "This is a map {host:'hostname_of_server', assigned:timestamp of when assigned to that server}."
        settings    :
            type : 'map'
            desc : 'This is a map that defines the free base quotas that a project has. It is of the form {cores: 1.5, cpu_shares: 768, disk_quota: 1000, memory: 2000, mintime: 36000000, network: 0}.  WARNING: some of the values are strings not numbers in the database right now, e.g., disk_quota:"1000".'
        status      :
            type : 'map'
            desc : 'This is a map computed by the status command run inside a project, and slightly enhanced by the compute server, which gives extensive status information about a project.  It has the form {console_server.pid: [pid of the console server, if running], console_server.port: [port if it is serving], disk_MB: [MB of used disk], installed: [whether code is installed], local_hub.pid: [pid of local hub server process],  local_hub.port: [port of local hub process], memory: {count:?, pss:?, rss:?, swap:?, uss:?} [output by smem],  raw.port: [port that the raw server is serving on], sage_server.pid: [pid of sage server process], sage_server.port: [port of the sage server], secret_token: [long random secret token that is needed to communicate with local_hub], state: "running" [see COMPUTE_STATES below], version: [version number of local_hub code]}'
        state       :
            type : 'map'
            desc : 'Info about the state of this project of the form  {error: "", state: "running", time: timestamp}, where time is when the state was last computed.  See COMPUTE_STATES below.'
        last_edited :
            type : 'timestamp'
            desc : 'The last time some file was edited in this project.  This is the last time that the file_use table was updated for this project.'
        last_active :
            type : 'map'
            desc : "Map from account_id's to the timestamp of when the user with that account_id touched this project."
        created :
            type : 'timestamp'
            desc : 'When the account was created.'
        action_request :
            type : 'map'
            desc : "Request state change action for project: {action:['restart', 'stop', 'save', 'close'], started:timestamp, err:?, finished:timestamp}"
        storage :
            type : 'map'
            desc : "This is a map {host:'hostname_of_server', assigned:when first saved here, saved:when last saved here}."
        storage_history :
            type : 'array'
            desc : 'Array of maps {host:?, assigned:?} of *previous* servers; add an entry to this array each time storage location changes.'
        last_backup :
            type : 'timestamp'
            desc : "Timestamp of last off-disk successful backup using bup to Google cloud storage"
        storage_request :
            type : 'map'
            desc : "{action:['save', 'close', 'move', 'open'], requested:timestap, pid:?, target:?, started:timestamp, finished:timestamp, err:?}"
        course :
            type : 'map'
            desc : '{project_id:[id of project that contains .course file], path:[path to .course file], pay:?, account_id:[account id of student]}, where pay is either not set (or equals falseish) or is a timestamp by which the students must move the project to a members only server.'

    indexes :
        users                     : ["that.r.row('users').keys()", {multi:true}]
        host                      : ["that.r.row('host')('host')"]
        last_edited               : [] # so can get projects last edited recently
        storage_request           : ["[that.r.row('storage')('host'), that.r.row('storage_request')('requested')]"]
        storage_request_requested : ["that.r.row('storage_request')('requested')"] # so can get all projects with a recent storage request quickly
        # see code below for some additional indexes

    user_query:
        get :
            all :
                cmd  : 'getAll'
                args : ['account_id', index:'users']
            fields :
                project_id     : null
                title          : ''
                description    : ''
                users          : {}
                invite         : null   # who has been invited to this project via email
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
                users          : (obj, db, account_id) -> db._user_set_query_project_users(obj, account_id)
                action_request : true   # used to request that an action be performed, e.g., "save"; handled by before_change

            before_change : (database, old_val, new_val, account_id, cb) ->
                database._user_set_query_project_change_before(old_val, new_val, account_id, cb)

            on_change : (database, old_val, new_val, account_id, cb) ->
                database._user_set_query_project_change_after(old_val, new_val, account_id, cb)

for group in misc.PROJECT_GROUPS
    schema.projects.indexes[group] = [{multi:true}]

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

# Table that provides extended read info about a single project
# but *ONLY* for admin.
schema.projects_admin =
    primary_key : schema.projects.primary_key
    virtual     : 'projects'
    fields      : schema.projects.fields
    user_query:
        get :
            admin  : true   # only admins can do get queries on this table (without this, users who have read access could read)
            all :
                cmd  : 'getAll'
                args : ['project_id']
            fields : schema.projects.user_query.get.fields

# Get publicly available information about a project.
#
schema.public_projects =
    anonymous : true
    virtual   : 'projects'
    user_query :
        get :
            all :
                cmd : 'getAll'
                args : ['project_id-public']
            fields :
                project_id : true
                title      : true


schema.public_paths =
    primary_key: 'id'
    anonymous : true   # allow user *read* access, even if not signed in
    fields:
        id          : true
        project_id  : true
        path        : true
        description : true
        disabled    : true   # if true then disabled
    indexes:
        project_id : []
    user_query:
        get :
            all :
                cmd : 'getAll'
                args : ['project_id', index:'project_id']
            fields :
                id          : null
                project_id  : null
                path        : null
                description : null
                disabled    : null   # if true then disabled
        set :
            fields :
                id          : (obj, db) -> db.sha1(obj.project_id, obj.path)
                project_id  : 'project_write'
                path        : true
                description : true
                disabled    : true
            required_fields :
                id          : true
                project_id  : true
                path        : true

schema.remember_me =
    primary_key : 'hash'
    fields :
        hash       : true
        value      : true
        account_id : true
        expire     : true
    indexes :
        expire     : []
        account_id : []

schema.server_settings =
    primary_key : 'name'
    anonymous   : false
    fields :
        name  : true
        value : true
    user_query:
        # NOTE: can *set* but cannot get!
        set:
            admin : true
            fields:
                name  : null
                value : null

# Settings to customize a given site, typically a private install of SMC.
exports.site_settings_conf =
    site_name:
        name    : "Site name"
        desc    : "The heading name of your site."
        default : "SageMathCloud"
    site_description:
        name    : "Site description"
        desc    : "The description of your site."
        default : "collaborative computational mathematics"
    terms_of_service:
        name    : "Terms of service link text"
        desc    : "The text displayed for the terms of service link (make empty to not require)."
        default : 'By clicking Sign up! you agree to our <a target="_blank" href="/policies/terms.html">Terms of Service</a>.'
    account_creation_email_instructions:
        name    : 'Account creation instructions'
        desc    : "Instructions displayed next to the box where a user creates their account using their name and email address."
        default : 'Create an Account'
    help_email:
        name    : "Help email address"
        desc    : "Email address that user is directed to use for support requests"
        default : "help@sagemath.com"

site_settings_fields = misc.keys(exports.site_settings_conf)

schema.site_settings =
    virtual   : 'server_settings'
    anonymous : false
    user_query:
        # NOTE: can set and get certain fields.
        get:
            all :
                cmd  : 'getAll'
                args : site_settings_fields
            admin  : true
            fields :
                name  : null
                value : null
        set:
            admin : true
            fields:
                name  : (obj, db) ->
                    if obj.name in site_settings_fields then obj.name else throw Error("setting '#{obj.name}' not allowed")
                value : null

schema.stats =
    primary_key: 'id'
    anonymous : true   # allow user access, even if not signed in
    fields:
        id                  : true
        time                : true
        accounts            : true
        projects            : true
        active_projects     : true
        last_hour_projects  : true
        last_day_projects   : true
        last_week_projects  : true
        last_month_projects : true
        hub_servers         : true
    indexes:
        time : []
    user_query:
        get:
            all :
                cmd  : 'between'
                args : (obj, db) -> [misc.hours_ago(1), db.r.maxval, {index:'time'}]
            fields :
                id                  : null
                time                : null
                accounts            : 0
                projects            : 0
                active_projects     : 0
                last_hour_projects  : 0
                last_day_projects   : 0
                last_week_projects  : 0
                last_month_projects : 0
                hub_servers         : []

schema.storage_servers =
    primary_key : 'host'
    fields :
        host : true

schema.system_notifications =
    primary_key : 'id'
    fields :
        id :
            type : 'id'
            desc : 'primary key'
        time :
            type : 'timestamp'
            desc : 'time of this message'
        text :
            type : 'string'
            desc : 'the text of the message'
        priority:
            type : 'string'
            desc : 'one of "low", "medium", or "high"'
        done:
            type : 'bool'
            desc : 'if true, then this notification is no longer relevant'
    indexes:
        time : []
    user_query:
        get:
            all :
                cmd  : 'between'
                args : (obj, db) -> [misc.hours_ago(1), db.r.maxval, {index:'time'}]
            fields :
                id       : null
                time     : null
                text     : ''
                priority : 0
                done     : false
        set:
            admin : true
            fields:
                id       : true
                time     : true
                text     : true
                priority : true
                done     : true


schema.syncstrings =
    primary_key : 'string_id'
    fields :
        string_id :
            type : 'uuid'
            desc : 'id of this synchronized string'
        project_id  :
            type : 'uuid'
            desc : 'optional project that this synchronized string belongs to (if it belongs to a project)'
        path :
            type : 'string'
            desc : 'optional path of file being edited'
        users :
            type : 'array'
            desc : "array of account_id's of those who have edited this string. Index of account_id in this array is used to represent patch authors."
        snapshot :
            type : 'map'
            desc : 'last snapshot of the synchronized string as map {string:"the string", time:time}; the current value of the syncstring is the result of applying all patches with timestamp strictly greater than time to the given string'

    user_query:
        get :
            all:
                cmd   : 'getAll'
                args  : (obj, db) -> [obj.string_id]
            fields :
                string_id  : null
                users      : null
                snapshot   : null
                project_id : null
                path       : null
        set :
            # TODO: impose constraints on what can set
            fields :
                string_id  : true
                users      : true
                snapshot   : true
                project_id : true
                path       : true


schema.patches =
    primary_key: 'id'  # this is a compound primary key as an array -- [string_id, time, user_id]
    fields:
        id         : true
        patch      : true
    user_query:
        get :
            all :  # if input id in query is [string_id, t], this gets patches with given string_id and time >= t
                cmd  : 'between'
                args : (obj, db) -> [[obj.id[0], obj.id[1] ? db.r.minval, db.r.minval], [obj.id[0], db.r.maxval, db.r.maxval]]
            fields :
                id    : 'null'   # 'null' = field gets used for args above then set to null
                patch : null
        set :
            fields :
                id    : true
                patch : true
            required_fields :
                id    : true
                patch : true


# Client side versions of some db functions, which are used, e.g., when setting fields.
sha1 = require('sha1')
class ClientDB
    constructor: ->
        @r = {}

    sha1 : (args...) =>
        v = (if typeof(x) == 'string' then x else JSON.stringify(x) for x in args)
        return sha1(args.join(''))

    _user_set_query_project_users: (obj) =>
        # client allows anything; server may be more stringent
        return obj.users

    _user_set_query_project_change_after: (obj, old_val, new_val, cb) =>
        cb()
    _user_set_query_project_change_before: (obj, old_val, new_val, cb) =>
        cb()

exports.client_db = new ClientDB()



###
Compute related schema stuff (see compute.coffee)

Here's a picture of the finite state machine defined below:

   ----------[closing] ------- --------- [stopping] <--------
  \|/                        \|/                           |
[closed] --> [opening] --> [opened] --> [starting] --> [running]
                             /|\                          /|\
                              |                            |
                             \|/                          \|/
                           [saving]                     [saving]

The icon names below refer to font-awesome, and are used in the UI.

###

exports.COMPUTE_STATES =
    closed:
        desc     : 'None of the files, users, etc. for this project are on the compute server.'
        icon     : 'stop'     # font awesome icon
        display  : 'Offline'  # displayed name for users
        stable   : true
        to       :
            open : 'opening'
        commands : ['open', 'move', 'status', 'destroy', 'mintime']

    opened:
        desc     : 'All files and snapshots are ready to use and the project user has been created, but the project is not running.'
        icon     : 'stop'
        display  : 'Stopped'
        stable   : true
        to       :
            start : 'starting'
            close : 'closing'
            save  : 'saving'
        commands : ['start', 'close', 'save', 'copy_path', 'mkdir', 'directory_listing', 'read_file', 'network', 'mintime', 'disk_quota', 'compute_quota', 'status', 'migrate_live']

    running:
        desc     : 'The project is opened, running, and ready to be used.'
        icon     : 'edit'
        display  : 'Running'
        stable   : true
        to       :
            stop : 'stopping'
            save : 'saving'
        commands : ['stop', 'save', 'address', 'copy_path', 'mkdir', 'directory_listing', 'read_file', 'network', 'mintime', 'disk_quota', 'compute_quota', 'status', 'migrate_live']

    saving:
        desc     : 'The project is being copied to a central file server for longterm storage.'
        icon     : 'save'
        display  : 'Saving to server'
        to       : {}
        timeout  : 30*60
        commands : ['address', 'copy_path', 'mkdir', 'directory_listing', 'read_file', 'network', 'mintime', 'disk_quota', 'compute_quota', 'status']

    closing:
        desc     : 'The project is in the process of being closed, so the latest changes are being saved to the server and all processes are being killed.'
        icon     : 'close'
        display  : 'Closing'
        to       : {}
        timeout  : 5*60
        commands : ['status', 'mintime']

    opening:
        desc     : 'The project is being opened, so all files and snapshots are being downloaded, the user is being created, etc. This could take up to 10 minutes depending on the size of your project.'
        icon     : 'gears'
        display  : 'Opening'
        to       : {}
        timeout  : 30*60
        commands : ['status', 'mintime']

    starting:
        desc     : 'The project is starting up and getting ready to be used.'
        icon     : 'flash'
        display  : 'Starting'
        to       :
            save : 'saving'
        timeout  : 60
        commands : ['save', 'copy_path', 'mkdir', 'directory_listing', 'read_file', 'network', 'mintime', 'disk_quota', 'compute_quota', 'status']

    stopping:
        desc     : 'All processes associated to the project are being killed.'
        icon     : 'hand-stop-o'
        display  : 'Stopping'
        to       :
            save : 'saving'
        timeout  : 60
        commands : ['save', 'copy_path', 'mkdir', 'directory_listing', 'read_file', 'network', 'mintime', 'disk_quota', 'compute_quota', 'status']

#
# Upgrades to projects.
#

upgrades = {}

upgrades.max_per_project =
    disk_quota : 50000
    memory     : 8000
    cores      : 4
    network    : 1
    cpu_shares : 2048
    mintime    : 24*3600*90
    member_host : 1

# In the params listed below you *MUST* define all of display, display_unit,
# display_factor, pricing_unit, pricing_factor, input_type, and desc!   This
# is assumed elsewhere.
upgrades.params =
    disk_quota :
        display        : 'Disk space'
        unit           : 'MB'
        display_unit   : 'MB'
        display_factor : 1
        pricing_unit   : 'GB'
        pricing_factor : 1/1000
        input_type     : 'number'
        desc           : 'The maximum amount of disk space (in MB) that a project may use.'
    memory :
        display        : 'Memory'
        unit           : 'MB'
        display_unit   : 'MB'
        display_factor : 1
        pricing_unit   : 'GB'
        pricing_factor : 1/1000
        input_type     : 'number'
        desc           : 'The maximum amount of memory that all processes in a project may use in total.'
    cores :
        display        : 'CPU cores'
        unit           : 'core'
        display_unit   : 'core'
        display_factor : 1
        pricing_unit   : 'core'
        pricing_factor : 1
        input_type     : 'number'
        desc           : 'The maximum number of CPU cores that a project may use.'
    cpu_shares :
        display        : 'CPU shares'
        unit           : 'share'
        display_unit   : 'share'
        display_factor : 1/256
        pricing_unit   : 'share'
        pricing_factor : 1/256
        input_type     : 'number'
        desc           : 'Relative priority of this project versus other projects running on the same computer.'
    mintime :
        display        : 'Idle timeout'
        unit           : 'second'
        display_unit   : 'hour'
        display_factor : 1/3600  # multiply internal by this to get what should be displayed
        pricing_unit   : 'day'
        pricing_factor : 1/86400
        input_type     : 'number'
        desc           : 'If the project is not used for this long, then it will be automatically stopped.'
    network :
        display        : 'Network access'
        unit           : 'upgrade'
        display_unit   : 'upgrade'
        display_factor : 1
        pricing_unit   : 'upgrade'
        pricing_factor : 1
        input_type     : 'checkbox'
        desc           : 'Network access enables a project to connect to the computers outside of SageMathCloud.'
    member_host :
        display        : 'Member hosting'
        unit           : 'upgrade'
        display_unit   : 'upgrade'
        display_factor : 1
        pricing_unit   : 'upgrade'
        pricing_factor : 1
        input_type     : 'checkbox'
        desc           : 'Moves this project to a members-only server, which has less competition for resources.'

upgrades.field_order = ['member_host', 'network', 'mintime', 'memory', 'disk_quota', 'cpu_shares', 'cores']

# live_subscriptions is an array of arrays.  Each array should have length a divisor of 12.
# The subscriptions will be displayed one row at a time.
upgrades.live_subscriptions = [['standard', 'premium', 'professional'],
                              ['small_course', 'medium_course', 'large_course']]

upgrades.period_names =
    month  : 'month'
    year   : 'year'
    month4 : '4 months'

# TODO: change from "membership" to "subscription".

membership = upgrades.membership = {}

membership.professional =    # a user that has a professional membership
    icon  : 'battery-full'
    price :
        month  : 99
        year   : 999
    benefits :
        cores       : 5
        cpu_shares  : 128*20
        disk_quota  : 5000*20
        member_host : 2*20
        memory      : 3000*20
        mintime     : 24*3600*20
        network     : 10*20

membership.premium =    # a user that has a premium membership
    icon  : 'battery-three-quarters'
    price :
        month  : 49
        year   : 499
    benefits :
        cores       : 2
        cpu_shares  : 128*8
        disk_quota  : 5000*8
        member_host : 2*8
        memory      : 3000*8
        mintime     : 24*3600*8
        network     : 10*8

membership.standard =   # a user that has a standard membership
    icon  : 'battery-quarter'
    price :
        month  : 7
        year   : 79
    benefits :
        cores       : 0
        cpu_shares  : 128
        disk_quota  : 5000
        member_host : 2
        memory      : 3000
        mintime     : 24*3600
        network     : 20


membership.large_course =
    icon  : 'battery-full'
    price :
        month4 : 999
    benefits :
        cores       : 0
        cpu_shares  : 0
        disk_quota  : 0
        member_host : 250
        network     : 500

membership.medium_course =
    icon  : 'battery-three-quarters'
    price :
        month4 : 399
    benefits :
        cores       : 0
        cpu_shares  : 0
        disk_quota  : 0
        member_host : 70
        network     : 140

membership.small_course =
    icon  : 'battery-quarter'
    price :
        month4 : 199
    benefits :
        cores       : 0
        cpu_shares  : 0
        disk_quota  : 0
        member_host : 25
        network     : 50

membership.student_course =
    icon  : 'graduation-cap'
    price :
        month4 : 9
    benefits :
        cores       : 0
        cpu_shares  : 0
        disk_quota  : 0
        member_host : 1
        network     : 1


exports.PROJECT_UPGRADES = upgrades
