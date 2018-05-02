###
Rst Editor Actions
###

{Actions}   = require('../code-editor/actions')
{print_rst} = require('./print')
rst2html    = require('./rst2html')

class exports.Actions extends Actions
    _init: (args...) =>
        super._init(args...)   # call the _init for the parent class
        if not @is_public
            @_init_syncstring_value()
            @_init_spellcheck()  # TODO: need to "detex" (?)
            @_init_rst2html()
        else
            @_init_content()

    _init_rst2html: =>
        @_syncstring.on('save-to-disk', @_run_rst2html)
        @_run_rst2html()

    _run_rst2html: (time) =>
        @set_status('Running rst2html...')
        rst2html.convert
            path       : @path
            project_id : @project_id
            time       : time
            cb         : (err) =>
                @set_status('')
                if err
                    @set_error(err)
                else
                    @set_reload('rst')

    _raw_default_frame_tree: =>
        if @is_public
            type : 'cm'
        else
            direction : 'col'
            type      : 'node'
            first     :
                type : 'cm'
            second    :
                type : 'rst'

    print: (id) =>
        node = @_get_frame_node(id)
        type = node.get('type')
        if type == 'cm'
            super.print(id)
            return
        if type != 'rst'
            # no other types support printing
            @set_error('printing of #{type} not implemented')
            return
        err = print_rst(project_id: @project_id, path: @path)
        if err
            @setState(error: err)


