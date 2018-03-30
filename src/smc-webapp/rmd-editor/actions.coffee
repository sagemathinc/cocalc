###
R Markdown Editor Actions
###

{Actions}        = require('../markdown-editor/actions')
{print_markdown} = require('../markdown-editor/print')
rmd2md           = require('./rmd2md')

class exports.Actions extends Actions
    _init: (args...) =>
        super._init(args...)   # call the _init for the parent class
        if not @is_public  # one extra thing after markdown.
            @_init_rmd2md()

    _init_rmd2md: =>
        @_syncstring.on('save-to-disk', @_run_rmd2md)
        @_run_rmd2md()

    _run_rmd2md: (time) =>
        # TODO: should only run knitr if at least one frame is visible showing preview.
        @set_status('Running knitr...')
        rmd2md.convert
            path       : @path
            project_id : @project_id
            time       : time
            cb         : (err, markdown) =>
                @set_status('')
                if err
                    @set_error(err)
                else
                    @setState(content: markdown)
                    setTimeout(->)

    _raw_default_frame_tree: =>
        if @is_public
            type : 'cm'
        else
            direction : 'col'
            type      : 'node'
            first     :
                type : 'cm'
            second    :
                type : 'markdown'
