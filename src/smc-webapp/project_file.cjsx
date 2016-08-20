###

React component for a single file editor.

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

file_editors = {}

###
ext       : string or array of strings to associate the editor with
generator : function (path, redux, project_id) -> rclass|function
init      : function (path, redux, project_id) -> string

###
exports.register_file_editor = (opts) ->
    opts = defaults opts,
        ext       : required
        generator : required # function
        init      : required # function
        icon   : 'file-o'
    console.log "register_file_editor #{opts.ext}"
    if typeof(opts.ext) == 'string'
        opts.ext = [opts.ext]
    for ext in opts.ext
        file_editors[ext] =
            icon      : opts.icon
            generator : opts.generator
            init      : opts.init

# Performs things that need to happen before render
# Calls file_editors[ext].init()
# Examples of things that go here:
# - Initializing store state
# - Initializing Actions
exports.initialize = (path, redux, project_id) ->
    ext = filename_extension(path)
    console.log("Initializing store and actions for path:", path)
    file_editors[ext]?.init(path, redux, project_id)

# Returns an editor instance for the path
exports.generate = (path, redux, project_id) ->
    ext = filename_extension(path)
    generator = file_editors[ext]?.generator
    if not generator?
        console.log("generator not found. Using fallback")
        generator = file_editors['']?.generator
    if generator?
        return generator(path, redux, project_id) # return the generated class
    else
        return () -> <div>No editor for {path} or fallback editor yet</div>

# Require each module, which loads a file editor.  These call register_file_editor.

require('./editor_chat')
require('./editor_archive')
require('./course/main')
# require('./editor_codemirror')

require('./editor').register_nonreact_editors()

