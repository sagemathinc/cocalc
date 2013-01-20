##################################################
# Editor for files in a project
##################################################

{defaults, required} = require('misc')

class exports.Editor
    constructor: (opts) ->
        opts = defaults opts,
            project_id : required
            initial_files : undefined # if given, attempt to open these files on creation

        @element = $("#salvus-editor-templates").find(".salvus-editor").clone().show()

        @tabs = {}   # filename:DOM element mapping

        if opts.initial_files?
            for filename in opts.initial_files
                @open(filename)

    create_tab: (filename) ->

    open: (filename) ->
        tab = tabs[filename]  # if defined, then we already have a tab
                              # with this file, so reload it.
        if not tab?
            # create new tab
            tab = tabs[filename] = @create_tab(filename)

    # Close this tab.  If it has unsaved changes, the user will be
    # warned.
    close: (filename) ->

    # Make this the active tab.
    activate: (filename) ->

    # Save the branch to disk, but do not do any sort of git commit.
    save: (filename) ->


    # Save just this file and commit it (only) to the current branch
    # with the given message.
    commit: (filename, message) ->

