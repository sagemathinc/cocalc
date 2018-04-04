###
LaTeX Editor Actions
###

{Actions}        = require('../code-editor/actions')
tex2pdf          = require('./tex2pdf')

class exports.Actions extends Actions
    _init: (args...) =>
        super._init(args...)   # call the _init for the parent class
        if not @is_public  # one extra thing after markdown.
            @_init_tex2pdf()

    _init_tex2pdf: =>
        @_syncstring.on('save-to-disk', @_run_tex2pdf)
        @_run_tex2pdf()

    _run_tex2pdf: (time) =>
        # TODO: should only run knitr if at least one frame is visible showing preview.
        @set_status('Running LaTeX...')
        tex2pdf.convert
            path       : @path
            project_id : @project_id
            time       : time
            cb         : (err, output) =>
                @set_status('')
                if err
                    @set_error(err)
                @set_reload('pdf')

    _raw_default_frame_tree: =>
        if @is_public
            type : 'cm'
        else
            direction : 'col'
            type      : 'node'
            first     :
                type : 'cm'
            second    :
                type : 'pdf'
