###
Markdown Editor Actions
###

{webapp_client} = require('../webapp_client')

tree_ops  = require('../code-editor/tree-ops')
{Actions} = require('../code-editor/actions')

{toggle_checkbox} = require('../tasks/desc-rendering')

# TODO: refactor more
{print_markdown} = require('../markdown-editor/print')

class exports.Actions extends Actions
    _init: (args...) =>
        super._init(args...)   # call the _init for the parent class
        if not @is_public
            @_init_syncstring_value()
            @_init_spellcheck()  # TODO: need to "detex" (?)
            @_init_rst2html()

    _init_rst2html: =>
        @_syncstring.on('save-to-disk', @_run_rst2html)
        @_run_rst2html()

    _run_rst2html: =>
        webapp_client.exec
            command    : 'rst2html'
            args       : [@path, @path.slice(0,@path.length-3) + 'html']
            project_id : @project_id
            cb         : (err, output) =>
                console.log err, output
                # horrible hack for now...
                @setState(save_to_disk: (@store.get('save_to_disk') ? 0) + 1)

    _raw_default_frame_tree: =>
        if @is_public
            type : 'rst'
        else
            direction : 'col'
            type      : 'node'
            first     :
                type : 'cm'
            second    :
                type : 'rst'

    print: (id) =>   # TODO: refactor more
        node = @_get_frame_node(id)
        if node.get('type') == 'cm'
            super.print(id)
            return
        html = value = undefined
        elt = $("#frame-#{id}")
        if elt.length == 1   # in case there were two (impossible) we don't do this and fall back to directly computing the html.
            html = elt.html()
        else
            value = @store.get('value')
        error = print_markdown
            value      : value
            html       : html
            project_id : @project_id
            path       : @path
            font_size  : node.get("font_size")
        if error
            @setState(error: error)
