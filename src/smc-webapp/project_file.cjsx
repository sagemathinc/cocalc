###
Supplies the interface for creating file editors in the webapp

---

 SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.

    Copyright (C) 2016, SageMath, Inc.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.

###

{React, ReactDOM, rtypes, rclass, Redux} = require('./smc-react')

{filename_extension, defaults, required} = require('smc-util/misc')

# Map of extensions to the appropriate structures below
file_editors = {}
###
ext       : string|array[string] to associate the editor with
component : rclass|function
generator : function (path, redux, project_id) -> rclass|function
    # One or the other. Calling generator should give the component
init      : function (path, redux, project_id) -> string (redux name)
    # Should initialize all stores, actions, sync, etc

remove    : function (path, redux, project_id) -> string (redux name)
    # Should remove all stores, actions, sync, etc

###
# component and generator could be merged. We only ever get one or the other.
exports.register_file_editor = (opts) ->
    opts = defaults opts,
        ext       : required
        component : undefined # rclass
        generator : undefined # function
        init      : required  # function
        remove    : required
        icon   : 'file-o'
    if typeof(opts.ext) == 'string'
        opts.ext = [opts.ext]

    # Assign to the extension(s)
    for ext in opts.ext
        file_editors[ext] =
            icon      : opts.icon
            component : opts.component
            generator : opts.generator
            init      : opts.init
            remove    : opts.remove

# Performs things that need to happen before render
# Calls file_editors[ext].init()
# Examples of things that go here:
# - Initializing store state
# - Initializing Actions
exports.initialize = (path, redux, project_id) ->
    ext = filename_extension(path)
    console.log(ext)
    redux_name = file_editors[ext]?.init(path, redux, project_id)
    if not redux_name?
        redux_name = file_editors[''].init(path, redux, project_id)
    return redux_name

# Returns an editor instance for the path

exports.generate = (path, redux, project_id) ->
    ext = filename_extension(path)
    generator = file_editors[ext]?.generator
    if generator?
        return generator(path, redux, project_id)

    component = file_editors[ext]?.component
    if not component?
        console.log("component not found. Using fallback")
        component = file_editors['']?.generator?(path, redux, project_id)
    if component?
        return component # return the class
    else
        return () -> <div>No editor for {path} or fallback editor yet</div>

exports.remove = (path, redux, project_id) ->
    ext = filename_extension(path)
    redux_name = file_editors[ext]?.remove(path, redux, project_id)
    if not redux_name?
        redux_name = file_editors[''].remove(path, redux, project_id)
    return redux_name

# Require each module, which loads a file editor.  These call register_file_editor.
# This should be a comprehensive list of all React editors

# require('./editor_terminal')
require('./editor_chat')
require('./editor_archive')
require('./course/main')
# require('./editor_codemirror')

require('./editor').register_nonreact_editors()
