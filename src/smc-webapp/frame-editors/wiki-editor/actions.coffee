###
Media wiki Editor Actions
###

{Actions}        = require('../markdown-editor/actions')
wiki2html        = require('./wiki2html')

class exports.Actions extends Actions
    _init: (args...) =>
        super._init(args...)   # call the _init for the parent class
        if not @is_public  # one extra thing after base class init...
            @_init_wiki2html()

    _init_wiki2html: =>
        @_syncstring.on('save-to-disk', @_run_wiki2html)
        @_run_wiki2html()

    _run_wiki2html: (time) =>
        # TODO: only run if at least one frame is visible showing preview (otherwise, we just waste cpu)
        @set_status('Running pandoc...')
        wiki2html.convert
            path       : @path
            project_id : @project_id
            time       : time
            cb         : (err, html_path) =>
                @set_status('')
                if err
                    @set_error(err)
                else
                    @set_reload('html')

    _raw_default_frame_tree: =>
        if @is_public
            type : 'cm'
        else
            direction : 'col'
            type      : 'node'
            first     :
                type : 'cm'
            second    :
                type : 'html'
