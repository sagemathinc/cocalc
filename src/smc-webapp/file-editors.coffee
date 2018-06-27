misc = require('smc-util/misc')

{defaults, required} = misc

{React} = require('./smc-react')

# Map of extensions to the appropriate structures below
file_editors =
    true  : {}    # true = is_public
    false : {}    # false = not public

exports.icon = (ext) ->
    # Return the icon for the given extension, if it is defined here,
    # with preference for non-public icon; returns undefined otherwise.
    return (file_editors[false] ? file_editors[true])?[ext]?.icon

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
        pub = !!opts.is_public
        if DEBUG and file_editors[pub][ext]?
            console.warn("duplicate registered extension '#{pub}/#{ext}' in register_file_editor")
        file_editors[pub][ext] =
            icon      : opts.icon
            component : opts.component
            generator : opts.generator
            init      : opts.init
            remove    : opts.remove
            save      : opts.save


get_ed = (path, is_public) ->
    is_public = !!is_public
    noext = "noext-#{misc.path_split(path).tail}".toLowerCase()
    e = file_editors[is_public][noext]  # special case: exact filename match
    if e?
        return e
    ext = misc.filename_extension_notilde(path).toLowerCase()
    # either use the one given by ext, or if there isn't one, use the '' fallback.
    return file_editors[is_public][ext] ? file_editors[is_public]['']

# Performs things that need to happen before render
# Calls file_editors[ext].init()
# Examples of things that go here:
# - Initializing store state
# - Initializing Actions
exports.initialize = (path, redux, project_id, is_public, content) ->
    return get_ed(path, is_public).init?(path, redux, project_id, content)

# Returns an editor instance for the path
exports.generate = (path, redux, project_id, is_public) ->
    e = get_ed(path, is_public)
    generator = e.generator
    if generator?
        return generator(path, redux, project_id)
    component = e.component
    if not component?
        return () -> React.createElement("div", "No editor for #{path} or fallback editor yet")
    return component

# Actually remove the given editor
exports.remove = (path, redux, project_id, is_public) ->
    if not path?
        return
    if typeof(path) != 'string'
        console.warn("BUG -- remove called on path of type '#{typeof(path)}'", path, project_id)
        # see https://github.com/sagemathinc/cocalc/issues/1275
        return

    if not is_public
        # always fire off a save to disk when closing.
        exports.save(path, redux, project_id, is_public)

    e = get_ed(path, is_public)
    e.remove?(path, redux, project_id)

    if not is_public
        # Also free the corresponding side chat, if it was created.
        require('./chat/register').remove?(misc.meta_file(path, 'chat'), redux, project_id)

# The save function may be called to request to save contents to disk.
# It does not take a callback.  It's a non-op if no save function is registered
# or the file isn't open.
exports.save = (path, redux, project_id, is_public) ->
    if not path?
        console.warn("WARNING: save(undefined path)")
        return
    get_ed(path, is_public).save?(path, redux, project_id)
