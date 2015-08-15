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

To specify more than one user quer against a table, make a new table as above, omitting
everything except the user_query section, and included a virtual section listing the actual
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
                    default_file_sort : 'time'
                first_name      : ''
                last_name       : ''
                terminal        :
                    font_size    : 14
                    color_scheme : 'default'
                    font         : 'monospace'
                autosave        : 45
                evaluate_key    : 'Shift-Enter'
                passports       : []
                groups          : []
                last_active     : null
                stripe_customer : null
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

schema.compute_servers =
    primary_key : 'host'
    fields :
        host         : true
        dc           : true
        port         : true
        secret       : true
        experimental : true

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
                cmd  : 'getAll'
                args : ['all_projects_read', index:'project_id']
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
    primary_key: 'instance_id'
    fields:
        instance_id  : true
        name         : true
        zone         : true
        machine_type : true
        region       : true
        state        : true

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
        project_id  : true
        title       : true
        description : true
        users       : true
        deleted     : true
        host        : true
        settings    : true
        status      : true
        state       : true
        last_edited : true
        last_active : true

    indexes :
        users          : ["that.r.row('users').keys()", {multi:true}]
        compute_server : []
        last_edited    : [] # so can get projects last edited recently
        # see code below for some additional indexes

    user_query:
        get :
            all :
                cmd  : 'getAll'
                args : ['account_id', index:'users']
            fields :
                project_id  : null
                title       : ''
                description : ''
                users       : {}
                deleted     : null
                host        : null
                settings    : null
                status      : null
                state       : null
                last_edited : null
                last_active : null
        set :
            fields :
                project_id  : 'project_write'
                title       : true
                description : true
                deleted     : true
                users       :         # TODO: actually implement refined permissions - here we really want account_id or user is owner
                    '{account_id}':
                        hide : true

for group in require('misc').PROJECT_GROUPS
    schema.projects.indexes[group] = [{multi:true}]

# Table that provides extended read/write info about a single project
# but *ONLY* for admin.
schema.projects_admin =
    primary_key : schema.projects.primary_key
    virtual     : 'projects'
    fields : schema.projects.fields
    user_query:
        get :
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

schema.stats =
    primary_key: 'id'
    anonymous : true   # allow user access, even if not signed in
    fields:
        id                  : true
        time                : true
        accounts            : true
        projects            : true
        active_projects     : true
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
                args : (obj, db) -> [new Date(new Date() - 1000*60*60), db.r.maxval, {index:'time'}]
            fields :
                id                  : null
                time                : null
                accounts            : 0
                projects            : 0
                active_projects     : 0
                last_day_projects   : 0
                last_week_projects  : 0
                last_month_projects : 0
                hub_servers         : []

schema.sync_strings =
    primary_key: 'time_id'
    fields:
        time_id    : true
        project_id : true
        path       : true
        account_id : true
        patch      : true
    indexes:
        'project_id-path' : ["[that.r.row('project_id'), that.r.row('path')]"]
    DISABLE_user_query:
        get :
            all :
                cmd  : 'getAll'
                args : (obj, db) -> [['project_id', obj.path], index:'project_id-path']
            fields :
                time_id     : null
                project_id  : null
                path        : null
                account_id  : null
                patch       : null
        set :
            fields :
                time_id     : true  # user assigned time_id
                project_id  : 'project_write'
                path        : true
                account_id  : 'account_id'
                patch       : true
            required_fields :
                time_id     : true
                project_id  : true
                path        : true
                patch       : true

# Client side versions of some db functions, which are used, e.g., when setting fields.
sha1 = require('sha1')
class ClientDB
    constructor: ->
        @r = {}
    sha1 : (args...) =>
        v = (if typeof(x) == 'string' then x else JSON.stringify(x) for x in args)
        return sha1(args.join(''))

exports.client_db = new ClientDB()



###
Compute related schema stuff (see compute.coffee)

Here's a picture of the finite state machine defined below:

                              --------- [stopping] <--------
                             \|/                           |
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

upgrades.params =
    disk_quota :
        display : 'Disk space'
        unit    : 'MB'
        display_unit   : 'MB'
        display_factor : 1
        desc    : 'The maximum amount of disk space (in MB) that a project may use.'
    memory :
        display : 'Memory'
        unit    : 'MB'
        display_unit   : 'MB'
        display_factor : 1
        desc    : 'The maximum amount of memory that all processes in a project may use in total.'
    cores :
        display : 'CPU cores'
        unit    : 'core'
        display_unit   : 'core'
        display_factor : 1
        desc    : 'The maximum number of CPU cores that a project may use.'
    cpu_shares :
        display : 'CPU shares'
        unit    : 'share'
        display_unit : 'share'
        display_factor : 1/256
        desc    : 'Relative priority of this project versus other projects running on the same computer.'
    mintime :
        display : 'Idle timeout'
        unit    : 'second'
        display_unit   : 'hour'
        display_factor : 1/3600  # multiply internal by this to get what should be displayed
        desc    : 'If the project is not used for this long, then it will be automatically stopped.'
    network :
        display : 'Network access'
        unit    : 'upgrade'
        display_unit   : 'upgrade'
        display_factor : 1
        desc    : 'Network access enables a project to connect to the computers outside of SageMathCloud.'
    member_host :
        display : 'Member hosting'
        unit    : 'upgrade'
        display_unit   : 'upgrade'
        display_factor : 1
        desc    : 'If enabled you may move this project to a members-only server.'

membership = upgrades.membership = {}

membership.premium =    # a user that has a premium membership
    cpu_shares  : 1024
    cores       : 10
    disk_quota  : 50000      # 50 GB
    memory      : 20000      # 20 GB
    mintime     : 240*3600   # 10 days
    network     : 50         # 50 projects
    member_host : 20         # 20 projects

membership.standard =   # a user that has a standard membership
    cpu_shares  : 256
    cores       : 1
    disk_quota  : 5000       # 5 GB
    memory      : 2000       # 2 GB
    mintime     : 24*3600    # 1 day
    network     : 5          # 5 projects
    member_host : 2          # 2 projects

membership.student  =
    course      : 1
    network     : 1
    member_host : 1

exports.PROJECT_UPGRADES = upgrades

