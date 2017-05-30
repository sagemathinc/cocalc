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
#
# Library for working with JSON messages for Salvus.
#
# We use functions to work with messages to ensure some level of
# consistency, defaults, and avoid errors from typos, etc.
#
###

misc     = require('./misc')
defaults = misc.defaults
required = defaults.required


message = (obj) ->
    exports[obj.event] = (opts={}) ->
        if opts.event?
            throw Error("ValueError: must not define 'event' when calling message creation function (opts=#{JSON.stringify(opts)}, obj=#{JSON.stringify(obj)})")
        defaults(opts, obj)
    return obj

# messages that can be used by the HTTP api.   {'event':true, ...}
exports.api_messages = {}

API = (obj) ->
    exports.api_messages[obj.event] = true


###

API messages

These options appear on all API messages:
- event: the command to be executed, for example "ping"
- id: uuid for the API call, will be returned in response. If id not provided
  in the API message, a random id will be generated and returned in the response

Additional notes:
- Options with default of "undefined" may be omitted.
- A valid API key is required on all API calls, including ping.
- The structure of the response to each API message is given in the
  immediately following "message" object definition.
- Some API messages, for example "query" and "get_usernames", require
  options to be passed as a JSON object, as noted in message comments.
- If JSON is not required for API message options, it is still valid.
- If API message options are sent as JSON, the message must be sent with
  a request header of "Content-Type: application/json".

###


############################################
# Compute server messages
#############################################

message
    event : 'compute_server_status'
    status : undefined

# Message for actions using a compute server
message
    event      : 'compute'
    project_id : undefined
    action     : required    # open, save, ...
    args       : undefined
    param      : undefined   # deprecate
    id         : undefined

message
    event      : 'project_state_update'
    project_id : required
    state      : required
    time       : required
    state_error : undefined  # error if there was one transitioning to this state


############################################
# Sage session management; executing code
#############################################

# hub --> sage_server&console_server, etc. and browser --> hub
message
    event        : 'start_session'
    type         : required           # "sage", "console";  later this could be "R", "octave", etc.
    # TODO: project_id should be required
    project_id   : undefined          # the project that this session will start in
    session_uuid : undefined          # set by the hub -- client setting this will be ignored.
    params       : undefined          # extra parameters that control the type of session
    id           : undefined
    limits       : undefined

# hub --> browser
message
    event         : 'session_started'
    id            : undefined
    session_uuid  : undefined
    limits        : undefined
    data_channel  : undefined # The data_channel is a single UTF-16
                              # character; this is used for
                              # efficiently sending and receiving
                              # non-JSON data (except channel
                              # '\u0000', which is JSON).

# hub --> client
message
    event         : 'session_reconnect'
    session_uuid  : undefined   # at least one of session_uuid or data_channel must be defined
    data_channel  : undefined


#

# client --> hub
message
    event        : 'connect_to_session'
    id           : undefined
    type         : required
    project_id   : required
    session_uuid : required
    params       : undefined          # extra parameters that control the type of session -- if we have to create a new one

message
    event         : 'session_connected'
    id            : undefined
    session_uuid  : required
    data_channel  : undefined  # used for certain types of sessions
    history       : undefined  # used for console/terminal sessions


# sage_server&console_server --> hub
message
    event  : 'session_description'
    pid    : required
    limits : undefined

# client <----> hub <--> sage_server
message
    event        : 'terminate_session'
    project_id   : undefined
    session_uuid : undefined
    reason       : undefined
    done         : undefined

message
    event        : 'execute_code'
    id           : undefined
    code         : required
    data         : undefined
    session_uuid : undefined
    cell_id      : undefined  # optional extra useful information about which cells is being executed
    preparse     : true
    allow_cache  : true

# Output resulting from evaluating code that is displayed by the browser.
# sage_server --> local hub --> hubs --> clients
message
    event        : 'output'
    id           : undefined   # the id for this particular computation
    stdout       : undefined   # plain text stream
    stderr       : undefined   # error text stream -- colored to indicate an error
    html         : undefined   # arbitrary html stream
    md           : undefined   # github flavored markdown
    tex          : undefined   # tex/latex stream -- is an object {tex:..., display:...}
    d3           : undefined   # d3 data document, e.g,. {d3:{viewer:'graph', data:{...}}}
    hide         : undefined   # 'input' or 'output'; hide display of given component of cell
    show         : undefined   # 'input' or 'output'; show display of given component of cell
    auto         : undefined   # true or false; sets whether or not cell auto-executess on process restart
    javascript   : undefined   # javascript code evaluation stream (see also 'execute_javascript' to run code directly in browser that is not part of the output stream).
    interact     : undefined   # create an interact layout defined by a JSON object
    obj          : undefined   # used for passing any JSON-able object along as output; this is used, e.g., by interact.
    file         : undefined   # used for passing a file -- is an object {filename:..., uuid:..., show:true}; the file is at https://cloud.sagemath.com/blobs/filename?uuid=[the uuid]
    raw_input    : undefined   # used for getting blocking input from client -- {raw_input:{prompt:'input stuff?', value:'', submitted:false}}
    done         : false       # the sequences of messages for a given code evaluation is done.
    session_uuid : undefined   # the uuid of the session that produced this output
    once         : undefined   # if given, message is transient; it is not saved by the worksheet, etc.
    clear        : undefined   # if true, clears all output of the current cell before rendering message.
    events       : undefined   # {'event_name':'name of Python callable to call', ...} -- only for images right now

# This message tells the client to execute the given Javascript code
# in the browser.  (For safety, the client may choose to ignore this
# message.)  If coffeescript==true, then the code is assumed to be
# coffeescript and is first compiled to Javascript.  This message is
# "out of band", i.e., not meant to be part of any particular output
# cell.  That is why there is no id key.

# sage_server --> hub --> client
message
    event        : 'execute_javascript'
    session_uuid : undefined              # set by the hub, since sage_server doesn't (need to) know the session_uuid.
    code         : required
    obj          : undefined
    coffeescript : false
    cell_id      : undefined    # if set, eval scope contains an object cell that refers to the cell in the worksheet with this id.


############################################
# Information about several projects or accounts
#############################################

API message
    event       : 'get_usernames' # get first and last names for a list of account ids
    id          : undefined
    account_ids : required

###
Note: Options for the 'get_usernames' API message must be sent as JSON object.
example (reformatted for readability):
  curl -u sk_abcdefQWERTY090900000000: -H "Content-Type: application/json" \
    -d '{"account_ids":["cc3cb7f1-14f6-4a18-a803-5034af8c0004","9b896055-920a-413c-9172-dfb4007a8e7f"]}' \
    https:// cocalc.com/api/v1/get_usernames
  ==>  {"event":"usernames",
        "id":"32b485a8-f214-4fda-a622-4dbfe0db2b9c",
        "usernames": {
           "cc3cb7f1-14f6-4a18-a803-5034af8c0004":{"first_name":"John","last_name":"Smith"},
           "9b896055-920a-413c-9172-dfb4007a8e7f":{"first_name":"Jane","last_name":"Doe"}}}
###

message
    event       : 'usernames'
    id          : undefined
    usernames   : required


############################################
# Account Management
#############################################

# client --> hub
API message
    event          : 'create_account'
    id             : undefined
    first_name     : required
    last_name      : required
    email_address  : required
    password       : required
    agreed_to_terms: required
    token          : undefined   # only required when token is set.
###

Examples:

Create a new account:
  curl -u sk_abcdefQWERTY090900000000: \
    -d first_name=John00 \
    -d last_name=Doe00 \
    -d email_address=jd@some_email \
    -d password=xyzabc09090 \
    -d agreed_to_terms=true https://cocalc.com/api/v1/create_account

Option 'agreed_to_terms' must be present and specified as true.
Account creation fails if there is already an account using the
given email address, if 'email_address' is improperly formatted,
and if password is fewer than 6 characters.

Attempting to create the same account a second time results in an error:
  curl -u sk_abcdefQWERTY090900000000: \
    -d first_name=John00 \
    -d last_name=Doe00 \
    -d email_address=jd@some_email \
    -d password=xyzabc09090 \
    -d agreed_to_terms=true https://cocalc.com/api/v1/create_account
  ==> {"event":"account_creation_failed",
       "id":"2332be03-aa7d-49a6-933a-cd9824b7331a",
       "reason":{"email_address":"This e-mail address is already taken."}}

###

# hub --> client
message
    event          : 'account_creation_failed'
    id             : undefined
    reason         : required

# client --> hub
API message
    event        : 'delete_account'
    id           : undefined
    account_id   : required

###
Examples:

Delete an existing account:
  curl -u sk_abcdefQWERTY090900000000: \
    -d account_id=99ebde5c-58f8-4e29-b6e4-b55b8fd71a1b \
    https://cocalc.com/api/v1/delete_account
  ==> {"event":"account_deleted","id":"9e8b68ac-08e8-432a-a853-398042fae8c9"}

Event 'account_deleted' is also returned if the account was already
deleted before the API call, or if the account never existed.

After successful 'delete_account', the owner of the deleted account
will not be able to login, but will still be listed as collaborator
or owner on projects which the user collaborated on or owned
respectively.

###

# hub --> client
message
    event        : 'account_deleted'
    id           : undefined
    error        : undefined

# client --> hub
message
    id             : undefined
    event          : 'sign_in'
    email_address  : required
    password       : required
    remember_me    : false


# hub --> client
message
    id             : undefined
    event          : 'remember_me_failed'
    reason         : required

# client --> hub
message
    id             : undefined
    event          : 'sign_in_failed'
    email_address  : required
    reason         : required

# hub --> client; sent in response to either create_account or log_in
message
    event          : 'signed_in'
    id             : undefined     # message uuid
    remember_me    : required      # true if sign in accomplished via remember_me cookie; otherwise, false.
    hub            : required      # ip address (on vpn) of hub user connected to.
    account_id     : required      # uuid of user's account
    email_address  : undefined     # email address they signed in under
    first_name     : undefined
    last_name      : undefined

# client --> hub
message
    event          : 'sign_out'
    everywhere     : false
    id             : undefined

# hub --> client
message
    event          : 'signed_out'
    id             : undefined

# client --> hub
API message
    event          : 'change_password'
    id             : undefined
    email_address  : required
    old_password   : ""
    new_password   : required

# hub --> client
# if error is true, that means the password was not changed; would
# happen if password is wrong (message:'invalid password').
message
    event          : 'changed_password'
    id             : undefined
    error          : undefined

# client --> hub: "please send a password reset email"
API message
    event         : "forgot_password"
    id            : undefined
    email_address : required

# hub --> client  "a password reset email was sent, or there was an error"
message
    event         : "forgot_password_response"
    id            : undefined
    error         : false

# client --> hub: "reset a password using this id code that was sent in a password reset email"
API message
    event         : "reset_forgot_password"
    id            : undefined
    reset_code    : required
    new_password  : required

message
    event         : "reset_forgot_password_response"
    id            : undefined
    error         : false

# client --> hub
API message
    event             : 'change_email_address'
    id                : undefined
    account_id        : required
    old_email_address : ""        # ignored -- deprecated
    new_email_address : required
    password          : ""

# hub --> client
message
    event               : 'changed_email_address'
    id                  : undefined
    error               : false  # some other error
    ttl                 : undefined   # if user is trying to change password too often, this is time to wait



# Unlink a passport auth for this account.
# client --> hub
API message
    event    : 'unlink_passport'
    strategy : required
    id       : required

message
    event : 'error'
    id    : undefined
    error : undefined

message
    event : 'success'
    id    : undefined

# You need to reconnect.
message
    event : 'reconnect'
    id    : undefined
    reason : undefined  # optional to make logs more informative


######################################################################################
# This is a message that goes
#      hub --> client
# In response, the client grabs "/cookies?id=...,set=...,get=..." via an AJAX call.
# During that call the server can get/set HTTP-only cookies.
# (Note that the /cookies url gets customized by base_url.)
######################################################################################
message
    event       : 'cookies'
    id          : required
    url         : "/cookies"
    get         : undefined  # name of a cookie to get
    set         : undefined  # name of a cookie to set
    value       : undefined  # value to set cookie to

###

Project Server <---> Hub interaction

These messages are mainly focused on working with individual projects.

Architecture:

  * The database stores a files object (with the file tree), logs
    (of each branch) and a sequence of git bundles that when
    combined together give the complete history of the repository.
    Total disk usage per project is limited by hard/soft disk quota,
    and includes the space taken by the revision history (the .git
    directory).

  * A project should only be opened by at most one project_server at
    any given time (not implemented: if this is violated then we'll
    merge the resulting conflicting repo's.)

  * Which project_server that has a project opened is stored in the
    database.  If a hub cannot connect to a given project server,
    the hub assigns a new project_server for the project and opens
    the project on the new project_server.  (The error also gets
    logged to the database.)  All hubs will use this new project
    server henceforth.

###

# The open_project message causes the project_server to create a new
# project or prepare to receive one (as a sequence of blob messages)
# from a hub.
#
# hub --> project_server
message
    event        : 'open_project'
    id           : required
    project_id   : required  # uuid of the project, which impacts
                             # where project is extracted, etc.
    quota        : required  # Maximum amount of disk space/inodes this
                             # project can use.  This is an object
                             #    {disk:{soft:megabytes, hard:megabytes}, inode:{soft:num, hard:num}}
    idle_timeout : required  # A time in seconds; if the project_server
                             # does not receive any messages related
                             # to this project for this many seconds,
                             # then it does the same thing as when
                             # receiving a 'close_project' message.
    ssh_public_key: required # ssh key of the one UNIX user that is allowed to access this account (this is running the hub).

# A project_server sends the project_opened message to the hub once
# the project_server has received and unbundled all bundles that
# define a project.
# project_server --> hub
message
    event : 'project_opened'
    id    : required

# A hub sends the save_project message to a project_server to request
# that the project_server save a snapshot of this project.  On
# success, the project_server will respond by sending a project_saved
# message then sending individual the bundles n.bundle for n >=
# starting_bundle_number.

# The project_saved message is sent to a hub by a project_server when
# the project_servers creates a new snapshot of the project in
# response to a save_project message.
# project_server --> hub
message
    event          : 'project_saved'
    id             : required       # message id, which matches the save_project message
    bundle_uuids   : required       # {uuid:bundle_number, uuid:bundle_number, ...} -- bundles are sent as blobs in separate messages.


######################################################################
# Execute a shell command in a given project
######################################################################

# client --> project
API message
    event      : 'project_exec'
    id         : undefined
    project_id : undefined
    path       : ''   # if relative, is a path under home; if absolute is what it is.
    command    : required
    args       : []
    timeout    : 10          # maximum allowed time, in seconds.
    max_output : undefined   # maximum number of characters in the output
    bash       : false       # if true, args are ignored and command is run as a bash command
    err_on_exit : true       # if exit code is nonzero send error return message instead of the usual output.

# project --> client
message
    event      : 'project_exec_output'
    id         : required
    stdout     : required
    stderr     : required
    exit_code  : required


######################################################################
# Jupyter server
######################################################################

# starts jupyter hub server and reports the port it is running on
# hub <--> project
API message
    event       : 'jupyter_port'
    port        : undefined  # gets set in response
    id          : undefined
    mathjax_url : undefined  # e.g. '/static/mathjax-2.6.1/MathJax.js'

#############################################################################


# The read_file_from_project message is sent by the hub to request
# that the project_server read a file from a project and send it back
# to the hub as a blob.  Also sent by client to hub to request a file
# or directory. If path is a directory, the optional archive field
# specifies how to create a single file archive, with supported
# options including:  'tar', 'tar.bz2', 'tar.gz', 'zip', '7z'.
#
# client --> hub --> project_server
message
    event        : 'read_file_from_project'
    id           : undefined
    project_id   : required
    path         : required
    archive      : 'tar.bz2'

# The file_read_from_project message is sent by the project_server
# when it finishes reading the file from disk.
# project_server --> hub
message
    event        : 'file_read_from_project'
    id           : required
    data_uuid    : required  # The project_server will send the raw data of the file as a blob with this uuid.
    archive      : undefined  # if defined, means that file (or directory) was archived (tarred up) and this string was added to end of filename.


# hub --> client
message
    event        : 'temporary_link_to_file_read_from_project'
    id           : required
    url          : required

# The client sends this message to the hub in order to write (or
# create) a plain text file (binary files not allowed, since sending
# them via JSON makes no sense).
# client --> hub
API message
    event        : 'read_text_file_from_project'
    id           : undefined
    project_id   : required
    path         : required

# hub --> client
message
    event        : 'text_file_read_from_project'
    id           : required
    content      : required

# The write_file_to_project message is sent from the hub to the
# project_server to tell the project_server to write a file to a
# project.  If the path includes directories that don't exists,
# they are automatically created (this is in fact the only way
# to make a new directory).
# hub --> project_server
message
    event        : 'write_file_to_project'
    id           : required
    project_id   : required
    path         : required
    data_uuid    : required  # hub sends raw data as a blob with this uuid immediately.

# The client sends this message to the hub in order to write (or
# create) a plain text file (binary files not allowed, since sending
# them via JSON makes no sense).
# client --> hub
API message
    event        : 'write_text_file_to_project'
    id           : undefined
    project_id   : required
    path         : required
    content      : required

# The file_written_to_project message is sent by a project_server to
# confirm successful write of the file to the project.
# project_server --> hub
message
    event        : 'file_written_to_project'
    id           : required

############################################
# Managing multiple projects
############################################

# client --> hub
API message
    event      : 'create_project' # create CoCalc project
    id         : undefined
    title      : required
    description: required
    start      : false   # start running the moment the project is created -- uses more resources, but possibly better user experience.
    
###
Note: Project owner is the same as the owner of the API key provided in the request.
example:
  curl -u sk_abcdefQWERTY090900000000: -d title='MY NEW PROJECT' -d description='sample project' https://cocalc.com/api/v1/create_project
  == > {"event":"project_created","id":"0b4df293-d518-45d0-8a3c-4281e501b85e","project_id":"07897899-6bbb-4fbc-80a7-3586c43348d1"}
###

# hub --> client
message
    event      : 'project_created'
    id         : required
    project_id : required


# hub --> client(s)
message
    event      : 'project_list_updated'

## search ---------------------------

# client --> hub
API message
    event : 'user_search'
    id    : undefined
    query : required    # searches for match in first_name or last_name.
    limit : 20          # maximum number of results requested

# hub --> client
message
    event   : 'user_search_results'
    id      : undefined
    results : required  # list of {first_name:, last_name:, account_id:} objects.

# hub --> client
API message
    event : 'project_users'
    id    : undefined
    users : required   # list of {account_id:?, first_name:?, last_name:?, mode:?, state:?}

API message
    event      : 'invite_collaborator'
    id         : undefined
    project_id : required
    account_id : required

API message
    event      : 'remove_collaborator'
    id         : undefined
    project_id : required
    account_id : required

# DANGER -- can be used to spam people.
API message
    event         : 'invite_noncloud_collaborators'
    id            : undefined
    project_id    : required
    replyto       : undefined
    replyto_name  : undefined
    to            : required
    subject       : undefined
    email         : required    # spam vector
    title         : required
    link2proj     : required

message
    event      : 'invite_noncloud_collaborators_resp'
    id         : undefined
    mesg       : required

###
Send/receive the current webapp code version number.

This can be used by clients to suggest a refresh/restart.
The client may sends their version number on connect.
If the client sends their version and later it is out of date
due to an update, the server sends a new version number update
message to that client.
###
# client <---> hub
message
    event       : 'version'
    version     : undefined    # gets filled in by the hub
    min_version : undefined    # if given, then client version must be at least min_version to be allowed to connect.

#############################################
#
# Message sent in response to attempt to save a blob
# to the database.
#
# hub --> local_hub --> sage_server
#
#############################################
message
    event     : 'save_blob'
    id        : undefined
    sha1      : required     # the sha-1 hash of the blob that we just processed
    ttl       : undefined    # ttl in seconds of the blob if saved; 0=infinite
    error     : undefined    # if not saving, a message explaining why.


# remove the ttls from blobs in the blobstore.
# client --> hub
message
    event     : 'remove_blob_ttls'
    id        : undefined
    uuids     : required     # list of sha1 hashes of blobs stored in the blobstore

# DEPRECATED -- used by bup_server
message
    event      : 'storage'
    action     : required    # open, save, snapshot, latest_snapshot, close
    project_id : undefined
    param      : undefined
    id         : undefined

message
    event      : 'projects_running_on_server'
    id         : undefined
    projects   : undefined   # for response


###
Direct messaging between browser client and local_hub,
forwarded on by global hub after ensuring write access.
###
message
    event          : 'local_hub'
    project_id     : required
    timeout        : undefined
    id             : undefined
    multi_response : false
    message        : required   # arbitrary message


###########################################################
#
# Copy a path from one project to another.
#
###########################################################
API message
    event             : 'copy_path_between_projects'
    id                : undefined
    src_project_id    : required    # id of source project
    src_path          : required    # relative path of director or file in the source project
    target_project_id : required    # if of target project
    target_path       : undefined   # defaults to src_path
    overwrite_newer   : false       # overwrite newer versions of file at destination (destructive)
    delete_missing    : false       # delete files in dest that are missing from source (destructive)
    backup            : false       # make ~ backup files instead of overwriting changed files
    timeout           : undefined   # how long to wait for the copy to complete before reporting "error" (though it could still succeed)
    exclude_history   : false


#############################################
# Admin Functionality
#############################################

# client --> hub;  will result in an error if the user is not in the admin group.
message
    event       : 'project_set_quotas'
    id          : undefined
    project_id  : required     # the id of the project's id to set.
    memory      : undefined    # RAM in megabytes
    cpu_shares  : undefined    # fair sharing with everybody is 256, not 1 !!!
    cores       : undefined    # integer max number of cores user can use (>=1)
    disk_quota  : undefined    # disk quota in megabytes
    mintime     : undefined    # time in **seconds** until idle projects are terminated
    network     : undefined    # 1 or 0; if 1, full access to outside network
    member_host : undefined    # 1 or 0; if 1, project will be run on a members-only machine

###
Printing Files
###
message
    event        : "print_to_pdf"
    id           : undefined
    path         : required
    options      : undefined

message
    event        : 'printed_to_pdf'
    id           : undefined
    path         : required


###
Ping/pong -- used for clock sync, etc.
###

API message
    event : 'ping' # test connection, return time as ISO string when server responds to ping
    id    : undefined

###
Examples:

Omitting request id:
  curl -X POST -u sk_abcdefQWERTY090900000000: https://cocalc.com/api/v1/ping
  ==> {"event":"pong","id":"c74afb40-d89b-430f-836a-1d889484c794","now":"2017-05-24T13:29:11.742Z"}

Using "uuid" shell command to create a request id:
  uuid
  ==> 553f2815-1508-416d-8e69-2dde5af3aed8
  curl -u sk_abcdefQWERTY090900000000: https://cocalc.com/api/v1/ping -d id=553f2815-1508-416d-8e69-2dde5af3aed8
  ==> {"event":"pong","id":"553f2815-1508-416d-8e69-2dde5af3aed8","now":"2017-05-24T13:47:21.312Z"}

Using JSON format to provide request id:
  curl -u sk_abcdefQWERTY090900000000: -H "Content-Type: application/json" -d '{"id":"8ec4ac73-2595-42d2-ad47-0b9641043b46"}' https://cocalc.com/api/v1/ping
  ==> {"event":"pong","id":"8ec4ac73-2595-42d2-ad47-0b9641043b46","now":"2017-05-24T17:15:59.288Z"}
###


message
    event : 'pong'
    id    : undefined
    now   : undefined  # timestamp



###
Reading listings and files from projects
without invoking the project server and
write auth requirement.  Instead the given
path in the project must be public.  These
functions don't even assume the client has
logged in.
###

# return a JSON object with all data that is
# meant to be publicly available about this project,
# who owns it, the title/description, etc.
# public request of listing of files in a project.
API message
    event         : 'public_get_directory_listing'
    id            : undefined
    project_id    : required
    path          : required
    hidden        : false   # show hidden files
    time          : false   # sort by timestamp, with newest first?
    start         : 0
    limit         : -1

API message
    event         : 'public_directory_listing'
    id            : undefined
    result        : required

# public request of contents of a text file in project
API message
    event         : 'public_get_text_file'
    id            : undefined
    project_id    : required
    path          : required

API message
    event         : 'public_text_file_contents'
    id            : undefined
    data          : required

API message
    event             : 'copy_public_path_between_projects'
    id                : undefined
    src_project_id    : required    # id of source project
    src_path          : required    # relative path of director or file in the source project
    target_project_id : required    # if of target project
    target_path       : undefined   # defaults to src_path
    overwrite_newer   : false       # overwrite newer versions of file at destination (destructive)
    delete_missing    : false       # delete files in dest that are missing from source (destructive)
    timeout           : undefined   # how long to wait for the copy to complete before reporting "error" (though it could still succeed)
    exclude_history   : false
    backup            : false

API message
    event : 'log_client_error'
    error : required

message
    event        : 'webapp_error'
    name         : required  # string
    message      : required  # string
    comment      : undefined # string
    stacktrace   : undefined # string
    file         : undefined # string
    path         : undefined # string
    lineNumber   : undefined # int
    columnNumber : undefined # int
    severity     : undefined # string
    browser      : undefined # string, how feature.coffee detected the browser
    mobile       : undefined # boolean, feature.coffee::IS_MOBILE
    responsive   : undefined # boolean, feature.coffee::is_responsive_mode
    user_agent   : undefined # string
    smc_version  : undefined # string
    build_date   : undefined # string
    smc_git_rev  : undefined # string
    uptime       : undefined # string
    start_time   : undefined # timestamp


###
Stripe integration
###

# Set the stripe payment method for this user.

# customer info
API message
    event   : 'stripe_get_customer'
    id      : undefined

API message
    event    : 'stripe_customer'
    id       : undefined
    customer : undefined                 # if user already has a stripe customer account, info about it.
    stripe_publishable_key : undefined   # if stripe is configured for this SMC instance, this is the public API key.


# card
API message
    event   : 'stripe_create_source'
    id      : undefined
    token   : required

API message
    event   : 'stripe_delete_source'
    card_id : required
    id      : undefined

API message
    event   : 'stripe_set_default_source'
    card_id : required
    id      : undefined

API message
    event   : 'stripe_update_source'
    card_id : required
    info    : required                  # see https://stripe.com/docs/api/node#update_card, except we don't allow changing metadata
    id      : undefined


# subscriptions to plans

# Get a list of all currently available plans:
API message
    event    : 'stripe_get_plans'
    id       : undefined

API message
    event    : 'stripe_plans'
    id       : undefined
    plans    : required    # [{name:'Basic', projects:1, description:'...', price:'$10/month', trial_period:'30 days', ...}, ...]

# Create a subscription to a plan
API message
    event    : 'stripe_create_subscription'
    id       : undefined
    plan     : required   # name of plan
    quantity : 1
    coupon   : undefined

# Delete a subscription to a plan
API message
    event           : 'stripe_cancel_subscription'
    id              : undefined
    subscription_id : required
    at_period_end   : true

# Modify a subscription to a plan, e.g., change which projects plan applies to.
API message
    event           : 'stripe_update_subscription'
    id              : undefined
    subscription_id : required
    quantity        : undefined   # only give if changing
    projects        : undefined   # change associated projects from what they were to new list
    plan            : undefined   # change plan to this
    coupon          : undefined   # apply a coupon to this subscription

API message
    event          : 'stripe_get_subscriptions'
    id             : undefined
    limit          : undefined    # between 1 and 100 (default: 10)
    ending_before  : undefined    # see https://stripe.com/docs/api/node#list_charges
    starting_after : undefined

message
    event         : 'stripe_subscriptions'
    id            : undefined
    subscriptions : undefined

# charges
API message
    event          : 'stripe_get_charges'
    id             : undefined
    limit          : undefined    # between 1 and 100 (default: 10)
    ending_before  : undefined    # see https://stripe.com/docs/api/node#list_charges
    starting_after : undefined

message
    event   : 'stripe_charges'
    id      : undefined
    charges : undefined

# invoices
API message
    event          : 'stripe_get_invoices'
    id             : undefined
    limit          : undefined    # between 1 and 100 (default: 10)
    ending_before  : undefined    # see https://stripe.com/docs/api/node#list_customer_invoices
    starting_after : undefined

message
    event   : 'stripe_invoices'
    id      : undefined
    invoices : undefined

message
    event       : 'stripe_admin_create_invoice_item'
    id          : undefined
    email_address : undefined # one of email or account_id must be given.
    account_id  : undefined   # user who will be invoiced
    amount      : undefined   # currently in US dollars  (if amount or desc not given, then only creates customer, not invoice)
    description : undefined


###
Support Tickets → right now going through Zendesk
###
API message # client → hub
    event        : 'create_support_ticket'
    id           : undefined
    username     : undefined
    email_address: required  # if there is no email_address in the account, there can't be a ticket! (for now)
    subject      : required  # like an email subject
    body         : required  # html or md formatted text
    tags         : undefined # a list of tags, like ['member']
    account_id   : undefined
    location     : undefined # from the URL, to know what the requester is talking about
    info         : undefined # additional data dict, like browser/OS

message # client ← hub
    event        : 'support_ticket_url'
    id           : undefined
    url          : required

API message # client → hub
    event        : 'get_support_tickets'
    id           : undefined
    # no account_id, that's known by the hub

message # client ← hub
    event        : 'support_tickets'
    id           : undefined
    tickets      : required  # json-list

###
Queries directly to the database (sort of like Facebook's GraphQL)
###

API message
    event          : 'query'
    id             : undefined
    query          : required
    changes        : undefined
    multi_response : false
    options        : undefined

###
Options for the 'query' API message must be sent as JSON object.
A query is either "get" (read from database), or "set" (write to database).
A query is "get" if any query keys are null, otherwise the query is "set".

Examples of 'get' query (reformatted for readability):

Get title and description for a project, given the project id.
  curl -u sk_abcdefQWERTY090900000000: -H "Content-Type: application/json" \
    -d '{"query":{"projects":{"project_id":"29163de6-b5b0-496f-b75d-24be9aa2aa1d","title":null,"description":null}}}' \
    https://cocalc.com/api/v1/query
  ==> {"event":"query",
       "id":"8ec4ac73-2595-42d2-ad47-0b9641043b46",
       "query":{"projects":{"project_id":"29163de6-b5b0-496f-b75d-24be9aa2aa1d",
                            "title":"MY NEW PROJECT 2",
                            "description":"desc 2"}},
       "multi_response":false}

Get project id, given title and description.
  curl -u sk_abcdefQWERTY090900000000: -H "Content-Type: application/json" \
    -d '{"query":{"projects":{"project_id":null,"title":"MY NEW PROJECT 2","description":"desc 2"}}}' \
    https://cocalc.com/api/v1/query
  ==> {"event":"query",
       "query":{"projects":{"project_id":"29163de6-b5b0-496f-b75d-24be9aa2aa1d",
                            "title":"MY NEW PROJECT 2",
                            "description":"desc 2"}},
       "multi_response":false,
       "id":"2be22e08-f00c-4128-b112-fa8581c2d584"}

Get users, given the project id.
  curl -u sk_abcdefQWERTY090900000000: -H "Content-Type: application/json" \
    -d '{"query":{"projects":{"project_id":"29163de6-b5b0-496f-b75d-24be9aa2aa1d","users":null}}}' \
    https://cocalc.com/api/v1/query
  ==> {"event":"query",
       "query":{"projects":{"project_id":"29163de6-b5b0-496f-b75d-24be9aa2aa1d",
                            "users":{"6c28c5f4-3235-46be-b025-166b4dcaac7e":{"group":"owner"},
                                     "111634c0-7048-41e7-b2d0-f87129fd409e":{"group":"collaborator"}}}},
       "multi_response":false,
       "id":"9dd3ef3f-002b-4893-b31f-ff51440c855f"}

Example of 'set' query. 

Set title and description for a project, given the project id.
  curl -u sk_abcdefQWERTY090900000000: -H "Content-Type: application/json" \
     -d '{"query":{"projects":{"project_id":"29163de6-b5b0-496f-b75d-24be9aa2aa1d", \
                               "title":"REVISED TITLE", \
                               "description":"REVISED DESC"}}}' \
     https://cocalc.com/api/v1/query
     ==> {"event":"query",
          "query":{},
          "multi_response":false,
          "id":"ad7d6b17-f5a9-4c5c-abc3-3823b1e1773f"}

Information on which fields are gettable and settable in the database tables
via API message is in file 'db-schema.coffee', in CoCalc sources on GitHub at
https://github.com/sagemathinc/cocalc/blob/master/src/smc-util/db-schema.coffee

Within file 'db-schema.coffee':

for project fields you can get, see the definition of
`schema.projects.user_query.get.fields`.
for user account fields you can set, see the definition of
`schema.projects.user_query.set.fields`.

for user account fields you can get, see the definition of
`schema.accounts.user_query.get.fields`.
for user account fields you can set, see the definition of
`schema.accounts.user_query.set.fields`.
###

message
    event : 'query_cancel'
    id    : undefined

# used to a get array of currently active change feed id's
message
    event          : 'query_get_changefeed_ids'
    id             : undefined
    changefeed_ids : undefined

###
API Key management for an account
###

# client --> hub
message
    event    : 'api_key'
    id       : undefined
    action   : required  # 'get', 'delete', 'regenerate'
    password : required

# hub --> client
message
    event : 'api_key_info'
    id    : undefined
    api_key : required

