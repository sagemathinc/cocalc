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

exports.register_file_editor = (opts) ->
    opts = defaults opts,
        ext    : required
        render : required
        icon   : 'file-o'
    console.log "register_file_editor #{opts.ext}"
    if typeof(opts.ext) == 'string'
        opts.ext = [opts.ext]
    for ext in opts.ext
        console.log('registering ', ext)
        file_editors[ext] =
            render : opts.render
            icon   : opts.icon

exports.render = (project_id, path, redux) ->
    ext = filename_extension(path)
    console.log "project_file.render project_id=#{project_id}, path=#{path}, ext=#{ext}"
    render = file_editors[ext]?.render
    if not render?
        render = file_editors['']?.render  # possible fallback
    if render?
        return render(redux, project_id, path)
    else
        return <div>No editor for {path} or fallback editor yet</div>


# Require each module, which loads a file editor.  These call register_file_editor.

require('./editor_chat')
require('./editor_archive')
require('./course/main')
#require('./editor_codemirror')

# TODO: This is needed only for the old non-react editors; will go away.
html = require('./console.html') + require('./editor.html') + require('./tasks.html') + require('./jupyter.html') + require('./interact.html') + require('./3d.html') + require('./d3.html')
$('body').append(html)

require('./editor').register_nonreact_editors()

