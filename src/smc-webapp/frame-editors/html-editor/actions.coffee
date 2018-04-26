###
HTML Editor Actions
###

tree_ops  = require('../code-editor/tree-ops')
{Actions} = require('../code-editor/actions')

{toggle_checkbox} = require('smc-webapp/tasks/desc-rendering')
{print_html} = require('./print')

class exports.Actions extends Actions
    _init: (args...) =>
        super._init(args...)   # call the _init for the parent class
        if not @is_public
            @_init_syncstring_value()
            @_init_spellcheck()
            @_init_iframe_reload()

    _init_iframe_reload: =>
        @_syncstring.on 'save-to-disk', =>
            @set_reload('iframe')

    _raw_default_frame_tree: =>
        if @is_public
            return {type : 'html'}
        else
            direction : 'col'
            type      : 'node'
            first     :
                type : 'cm'
            second    :
                type : 'iframe'

    print: (id) =>
        node = @_get_frame_node(id)
        if node.get('type') == 'cm'
            super.print(id)
            return

        html = value = src = undefined

        if node.get('type') == 'iframe'
            src = "#{window.app_base_url}/#{@project_id}/raw/#{@path}"
        else
            elt = $("#frame-#{id}")  # see remark in markdown actions, which is similar
            if elt.length == 1   # in case there were two (impossible) we don't do this and fall back to directly computing the html.
                html = elt.html()
            else
                value = @store.get('value')

        error = print_html
            value      : value
            html       : html
            src        : src
            project_id : @project_id
            path       : @path
            font_size  : node.get("font_size")
        if error
            @setState(error: error)
