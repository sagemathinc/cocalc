###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; witcreatehout even the implied warranty of
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
# (c) 2012, William Stein
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

message
    event       : 'get_usernames'
    id          : undefined
    account_ids : required

message
    event       : 'usernames'
    id          : undefined
    usernames   : required


############################################
# Account Management
#############################################

# client --> hub
message
    event          : 'create_account'
    id             : undefined
    first_name     : required
    last_name      : required
    email_address  : required
    password       : required
    agreed_to_terms: required
    token          : undefined   # only required when token is set.

# hub --> client
message
    event          : 'account_creation_failed'
    id             : undefined
    reason         : required

# client --> hub
message
    event        : 'delete_account'
    id           : undefined
    account_id   : required

# hub --> client
message
    event        : 'account_deletion_failed'
    id           : undefined
    error        : undefined

# client <--> hub
message
    event          : 'email_address_availability'
    id             : undefined
    email_address  : required
    is_available   : undefined

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
message
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
message
    event         : "forgot_password"
    id            : undefined
    email_address : required

# hub --> client  "a password reset email was sent, or there was an error"
message
    event         : "forgot_password_response"
    id            : undefined
    error         : false

# client --> hub: "reset a password using this id code that was sent in a password reset email"
message
    event         : "reset_forgot_password"
    id            : undefined
    reset_code    : required
    new_password  : required

message
    event         : "reset_forgot_password_response"
    id            : undefined
    error         : false

# client --> hub
message
    event             : 'change_email_address'
    id                : undefined
    account_id        : required
    old_email_address : ""
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
message
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

###################################################################################
#
# Project Server <---> Hub interaction
#
# These messages are mainly focused on working with individual projects.
#
# Architecture:
#
#   * The database stores a files object (with the file tree), logs
#     (of each branch) and a sequence of git bundles that when
#     combined together give the complete history of the repository.
#     Total disk usage per project is limited by hard/soft disk quota,
#     and includes the space taken by the revision history (the .git
#     directory).
#
#   * A project should only be opened by at most one project_server at
#     any given time (not implemented: if this is violated then we'll
#     merge the resulting conflicting repo's.)
#
#   * Which project_server that has a project opened is stored in the
#     database.  If a hub cannot connect to a given project server,
#     the hub assigns a new project_server for the project and opens
#     the project on the new project_server.  (The error also gets
#     logged to the database.)  All hubs will use this new project
#     server henceforth.
#
###################################################################################

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
#
# client --> hub --> project_server
message
    event                  : 'save_project'
    id                     : undefined
    project_id             : required    # uuid of a project

# The project_saved message is sent to a hub by a project_server when
# the project_servers creates a new snapshot of the project in
# response to a save_project message.
# project_server --> hub
message
    event          : 'project_saved'
    id             : required       # message id, which matches the save_project message
    bundle_uuids   : required       # {uuid:bundle_number, uuid:bundle_number, ...} -- bundles are sent as blobs in separate messages.


######################################################################
# Execute a program in a given project
######################################################################

# client --> project
message
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
message
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
message
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
message
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
message
    event      : 'create_project'
    id         : undefined
    title      : required
    description: required
    start      : false   # start running the moment the project is created -- uses more resources, but possibly better user experience.

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
message
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
message
    event : 'project_users'
    id    : undefined
    users : required   # list of {account_id:?, first_name:?, last_name:?, mode:?, state:?}

message
    event      : 'invite_collaborator'
    id         : undefined
    project_id : required
    account_id : required

message
    event      : 'remove_collaborator'
    id         : undefined
    project_id : required
    account_id : required

message
    event      : 'invite_noncloud_collaborators'
    id         : undefined
    project_id : required
    to         : required
    subject    : undefined
    email      : required    # spam vector
    title      : required
    link2proj  : required

message
    event      : 'invite_noncloud_collaborators_resp'
    id         : undefined
    mesg       : required

############################################
# Send/receive the current webapp code version number.
#
# This can be used by clients to suggest a refresh/restart.
# The client may sends their version number on connect.
# If the client sends their version and later it is out of date
# due to an update, the server sends a new version number update
# message to that client.
#
#############################################
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


###########################################################
#
# Direct messaging between browser client and local_hub,
# forwarded on by global hub after ensuring write access.
#
###########################################################
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
message
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

#############################################
# Printing Files
#############################################
message
    event        : "print_to_pdf"
    id           : undefined
    path         : required
    options      : undefined

message
    event        : 'printed_to_pdf'
    id           : undefined
    path         : required

message
    event : 'ping'
    id    : undefined

message
    event : 'pong'
    id    : undefined
    now   : undefined  # timestamp



#############################################
# Reading listings and files from projects
# without invoking the project server and
# write auth requirement.  Instead the given
# path in the project must be public.  These
# functions don't even assume the client has
# logged in.
#############################################

# return a JSON object with all data that is
# meant to be publically available about this project,
# who owns it, the title/description, etc.
message
    event         : 'public_get_project_info'
    id            : undefined
    project_id    : required

message
    event         : 'public_project_info'
    id            : undefined
    info          : required

# public request of listing of files in a project.
message
    event         : 'public_get_directory_listing'
    id            : undefined
    project_id    : required
    path          : required
    hidden        : false   # show hidden files
    time          : false   # sort by timestamp, with newest first?
    start         : 0
    limit         : -1

message
    event         : 'public_directory_listing'
    id            : undefined
    result        : required

# public request of contents of a text file in project
message
    event         : 'public_get_text_file'
    id            : undefined
    project_id    : required
    path          : required

message
    event         : 'public_text_file_contents'
    id            : undefined
    data          : required



message
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



message
    event : 'log_client_error'
    error : required




#############################################
# stripe integration
#############################################

# Set the stripe payment method for this user.

# customer info
message
    event   : 'stripe_get_customer'
    id      : undefined

message
    event    : 'stripe_customer'
    id       : undefined
    customer : undefined                 # if user already has a stripe customer account, info about it.
    stripe_publishable_key : undefined   # if stripe is configured for this SMC instance, this is the public API key.


# card
message
    event   : 'stripe_create_source'
    id      : undefined
    token   : required

message
    event   : 'stripe_delete_source'
    card_id : required
    id      : undefined

message
    event   : 'stripe_set_default_source'
    card_id : required
    id      : undefined

message
    event   : 'stripe_update_source'
    card_id : required
    info    : required                  # see https://stripe.com/docs/api/node#update_card, except we don't allow changing metadata
    id      : undefined


# subscriptions to plans

# Get a list of all currently available plans:
message
    event    : 'stripe_get_plans'
    id       : undefined

message
    event    : 'stripe_plans'
    id       : undefined
    plans    : required    # [{name:'Basic', projects:1, description:'...', price:'$10/month', trial_period:'30 days', ...}, ...]

# Create a subscription to a plan
message
    event    : 'stripe_create_subscription'
    id       : undefined
    plan     : required   # name of plan
    quantity : 1
    coupon   : undefined

# Delete a subscription to a plan
message
    event           : 'stripe_cancel_subscription'
    id              : undefined
    subscription_id : required
    at_period_end   : true

# Modify a subscription to a plan, e.g., change which projects plan applies to.
message
    event           : 'stripe_update_subscription'
    id              : undefined
    subscription_id : required
    quantity        : undefined   # only give if changing
    projects        : undefined   # change associated projects from what they were to new list
    plan            : undefined   # change plan to this
    coupon          : undefined   # apply a coupon to this subscription

message
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
message
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
message
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
    amount      : required   # currently in US dollars
    description : required

#############
# Support Tickets → right now going through Zendesk
#############
message # client → hub
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

message # client → hub
    event        : 'get_support_tickets'
    id           : undefined
    # no account_id, that's known by the hub

message # client ← hub
    event        : 'support_tickets'
    id           : undefined
    tickets      : required  # json-list

#############
# Queries directly to the database (sort of like Facebook's GraphQL)
#############

message
    event   : 'query'
    id      : undefined
    query   : required
    changes : undefined
    multi_response : false
    options : undefined

message
    event : 'query_cancel'
    id    : undefined

# used to a get array of currently active change feed id's
message
    event          : 'query_get_changefeed_ids'
    id             : undefined
    changefeed_ids : undefined
