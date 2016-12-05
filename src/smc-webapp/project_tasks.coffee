###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
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
# ProjectTasks are a collection of methods related to projects.
# The can have a callback, a return value, or be impure.
# They do not fit into the CQRS pattern in project_store.coffee and hence
# do not modify the state in the project store.
###############################################################################

{salvus_client}      = require('./salvus_client')
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
        salvus_client.exec
            project_id  : @project_id
            command     : 'test'
            args        : ['-s', f.tail]
            path        : f.head
            err_on_exit : true
            cb          : (err) ->
                opts.cb?(err)

    # makes sure that the given directory opts.path exists
    ensure_directory_exists: (opts) =>
        opts = defaults opts,
            path  : required
            cb    : undefined  # cb(true or false)
            alert : true
        salvus_client.exec
            project_id : @project_id
            command    : "mkdir"
            timeout    : 15
            args       : ['-p', opts.path]
            cb         : (err, result) =>
                if opts.alert
                    if err
                        alert_message(type:"error", message:err)
                    else if result.event == 'error'
                        alert_message(type:"error", message:result.error)
                opts.cb?(err or result.event == 'error')

    # returns the full URL path to the file (not the "raw" server)
    url_fullpath: (path) ->
        if window?
            loc = window.location
            base = "#{loc.protocol}//#{loc.hostname}"
        else
            base = 'https://cloud.sagemath.com'
        {join} = require('path')
        path = join("#{window.smc_base_url ? '/'}", "projects", "#{@project_id}", 'files', "#{misc.encode_path(path)}")
        return "#{base}" + (if path[0] == '/' then '' else '/') + path

    # returns the URL for the file at the given path
    url_href: (path) =>
        return "#{window.smc_base_url}/#{@project_id}/raw/#{misc.encode_path(path)}"

    # returns the download URL for a file at a given path
    download_href: (path) =>
        return "#{@url_href(path)}?download"

_project_tasks = {}
exports.project_tasks = (project_id) ->
    return _project_tasks[project_id] ?= _project_tasks[project_id] ? new ProjectTasks(project_id)
