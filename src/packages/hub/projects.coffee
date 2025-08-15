#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: MS-RSL – see LICENSE.md for details
#########################################################################

###
Projects
###

winston  = require('./logger').getLogger('projects')

postgres = require('@cocalc/database')
local_hub_connection = require('./local_hub_connection')
message = require('@cocalc/util/message')
{callback2} = require('@cocalc/util/async-utils')
misc    = require('@cocalc/util/misc')
misc_node = require('@cocalc/backend/misc_node')
{defaults, required} = misc

# Create a project object that is connected to a local hub (using
# appropriate port and secret token), login, and enhance socket
# with our message protocol.

_project_cache = {}
exports.new_project = (project_id, database, projectControl) ->
    P = _project_cache[project_id]
    if not P?
        P = new Project(project_id, database, projectControl)
        _project_cache[project_id] = P
    return P

class Project
    constructor: (@project_id, @database, @projectControl) ->
        @dbg("instantiating Project class")
        @local_hub = local_hub_connection.new_local_hub(@project_id, @database, @projectControl)
        # we always look this up and cache it
        @get_info()

    dbg: (m) =>
        winston.debug("project(#{@project_id}): #{m}")

    _fixpath: (obj) =>
        if obj? and @local_hub?
            if obj.path?
                if obj.path[0] != '/'
                    obj.path = @local_hub.path+ '/' + obj.path
            else
                obj.path = @local_hub.path

    owner: (cb) =>
        if not @database?
            cb('need database in order to determine owner')
            return
        @database.get_project
            project_id : @project_id
            columns : ['account_id']
            cb      : (err, result) =>
                if err
                    cb(err)
                else
                    cb(err, result[0])

    # get latest info about project from database
    get_info: (cb) =>
        if not @database?
            cb('need database in order to determine owner')
            return
        @database.get_project
            project_id : @project_id
            columns    : postgres.PROJECT_COLUMNS
            cb         : (err, result) =>
                if err
                    cb?(err)
                else
                    @cached_info = result
                    cb?(undefined, result)

    call: (opts) =>
        opts = defaults opts,
            mesg    : required
            multi_response : false
            timeout : 15
            cb      : undefined
        #@dbg("call")
        @_fixpath(opts.mesg)
        opts.mesg.project_id = @project_id
        @local_hub.call(opts)


    read_file: (opts) =>
        @dbg("read_file")
        @_fixpath(opts)
        opts.project_id = @project_id
        @local_hub.read_file(opts)

    write_file: (opts) =>
        @dbg("write_file")
        @_fixpath(opts)
        opts.project_id = @project_id
        @local_hub.write_file(opts)

