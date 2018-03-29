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
        rmd2md.convert
            path       : @path
            project_id : @project_id
            time       : time
            cb         : (err, markdown) =>
                if err
                    @set_error(err)
                else
                    @setState(content: markdown)

    set_markdown_view: (value) =>
        # ignore here -- the value is only set via run_rmd2md.