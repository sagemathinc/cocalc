###
HTML Editor Actions
###

immutable = require('immutable')

tree_ops  = require('../code-editor/tree-ops')
{Actions} = require('../code-editor/actions')

{toggle_checkbox} = require('../tasks/desc-rendering')
{print_html} = require('./print')

class exports.Actions extends Actions
    _init: (args...) =>
        super._init(args...)   # call the _init for the parent class
        if not @is_public
            @_init_syncstring_value()
            @_init_spellcheck()

    _raw_default_frame_tree: =>
        if @is_public
            return {type : 'html'}
        else
            direction : 'col'
            type      : 'node'
            first     :
                type : 'cm'
            second    :
                type : 'html'

    print: (id) =>
        node = @_get_frame_node(id)
        if node.get('type') == 'cm'
            super.print(id)
            return

        html = value = wrap = undefined

        if node.get('type') == 'iframe'
            html = @store.get('content')
            wrap = false
        else
            wrap = true
            elt = $("#frame-#{id}")  # see remark in markdown actions, which is similar
            if elt.length == 1   # in case there were two (impossible) we don't do this and fall back to directly computing the html.
                html = elt.html()
            else
                value = @store.get('value')

        error = print_html
            value      : value
            html       : html
            wrap       : wrap
            project_id : @project_id
            path       : @path
            font_size  : node.get("font_size")
        if error
            @setState(error: error)
