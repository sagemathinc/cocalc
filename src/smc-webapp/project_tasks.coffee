#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

# ProjectTasks are a collection of methods related to projects.
# The can have a callback, a return value, or be impure.
# They do not fit into the CQRS pattern in project_store.coffee and hence
# do not modify the state in the project store.

{webapp_client}      = require('./webapp-client')
{alert_message}      = require('./alerts')
misc                 = require('smc-util/misc')
{defaults, required} = misc

class ProjectTasks
    constructor: (@project_id) ->
        if not misc.is_valid_uuid_string(@project_id)
            console.trace()
            console.warn("ProjectTasks: INVALID project_id -- #{@project_id}")

    # test, if the given file exists and has nonzero size
    file_nonzero_size : (opts) =>
        opts = defaults opts,
            path : required
            cb   : undefined
        f = misc.path_split(opts.path)
        webapp_client.exec
            project_id  : @project_id
            command     : 'test'
            args        : ['-s', f.tail]
            path        : f.head
            err_on_exit : true
            cb          : (err) ->
                opts.cb?(err)

    # returns the full URL path to the file (not the "raw" server)
    url_fullpath: (path) ->
        {join} = require('path')
        {BASE_URL} = require('./misc_page')
        path = join(BASE_URL, "projects", "#{@project_id}", 'files', "#{misc.encode_path(path)}")
        return path

    # returns the URL for the file at the given path
    url_href: (path) =>
        return "#{window.app_base_url}/#{@project_id}/raw/#{misc.encode_path(path)}"

    # returns the download URL for a file at a given path
    download_href: (path) =>
        return "#{@url_href(path)}?download"

_project_tasks = {}
exports.project_tasks = (project_id) ->
    return _project_tasks[project_id] ?= _project_tasks[project_id] ? new ProjectTasks(project_id)
