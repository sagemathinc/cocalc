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

misc = require('smc-util/misc')

{React, ReactDOM, rtypes, rclass, Redux} = require('./smc-react')

{filename_extension, defaults, required} = require('smc-util/misc')
{file_associations} = require('./editor')

# Map of extensions to the appropriate structures below
file_editors =
    true  : {}    # true = is_public
    false : {}    # false = not public

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
        is_public : false
        component : undefined # rclass
        generator : undefined # function
        init      : undefined # function
        remove    : undefined
        icon      : 'file-o'
        save      : undefined # optional; If given, doing opts.save(path, redux, project_id) should save the document.

    if typeof(opts.ext) == 'string'
        opts.ext = [opts.ext]

    # Assign to the extension(s)
    for ext in opts.ext
        file_editors[!!opts.is_public][ext] =
            icon      : opts.icon
            component : opts.component
            generator : opts.generator
            init      : opts.init
            remove    : opts.remove
            save      : opts.save

# Performs things that need to happen before render
# Calls file_editors[ext].init()
# Examples of things that go here:
# - Initializing store state
# - Initializing Actions
exports.initialize = (path, redux, project_id, is_public) ->
    is_public = !!is_public
    ext = filename_extension(path).toLowerCase()
    e = file_editors[is_public][ext] ? file_editors[is_public]['']
    return e?.init?(path, redux, project_id)

# Returns an editor instance for the path
exports.generate = (path, redux, project_id, is_public) ->
    is_public = !!is_public
    ext = filename_extension(path).toLowerCase()
    e = file_editors[is_public][ext] ? file_editors[is_public]['']
    generator = e.generator
    if generator?
        return generator(path, redux, project_id)
    component = e.component
    if not component?
        return () -> <div>No editor for {path} or fallback editor yet</div>
    return component

# Actually remove the given editor
exports.remove = (path, redux, project_id, is_public) ->
    if not path?
        return
    if typeof(path) != 'string'
        console.warn("BUG -- remove called on path of type '#{typeof(path)}'", path, project_id)
        # see https://github.com/sagemathinc/smc/issues/1275
        return
    is_public = !!is_public
    ext = filename_extension(path).toLowerCase()
    # Use specific one for the given extension, or a fallback.
    remove = (file_editors[is_public][ext]?.remove) ? (file_editors[is_public]['']?.remove)
    remove?(path, redux, project_id)

    # Also free the corresponding side chat, if it was created.
    require('./editor_chat').remove_redux(misc.meta_file(path, 'chat'), redux, project_id)

# The save function may be called to request to save contents to disk.
# It does not take a callback.  It's a non-op if no save function is registered
# or the file isn't open.
exports.save = (path, redux, project_id, is_public) ->
    if not path?
        console.warn("WARNING: save(undefined path)")
        return
    is_public = !!is_public
    ext       = filename_extension(path).toLowerCase()
    # either use the one given by ext, or if there isn't one, use the '' fallback.
    save = (file_editors[is_public][ext]?.save) ? (file_editors[is_public]['']?.save)
    save?(path, redux, project_id)

exports.special_filenames_with_no_extension = () ->
    (name.slice(6) for name in Object.keys(file_associations) when name.slice(0,6) == 'noext-')

# Require each module, which loads a file editor.  These call register_file_editor.
# This should be a comprehensive list of all React editors

# require('./editor_terminal')
require('./smc_chat')
require('./editor_archive')
require('./course/main')
require('./editor_pdf')
require('./editor_time')

# Public editors
require('./public/editor_md')
require('./public/editor_image')

# require('./editor_codemirror')

require('./editor').register_nonreact_editors()
