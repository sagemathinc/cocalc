###
Markdown Editor Actions
###

tree_ops  = require('../code-editor/tree-ops')
{Actions} = require('../code-editor/actions')

{toggle_checkbox} = require('../tasks/desc-rendering')
{print_markdown} = require('./print')

class exports.Actions extends Actions
    _init: (args...) =>
        super._init(args...)   # call the _init for the parent class
        if not @is_public
            @_init_syncstring_value()
            @_init_spellcheck()

    _raw_default_frame_tree: =>
        if @is_public

            type : 'markdown'
        else
            direction : 'col'
            type      : 'node'
            first     :
                type : 'cm'
            second    :
                type : 'markdown'

    toggle_markdown_checkbox: (id, index, checked) =>
        # Ensure that an editor state is saved into the
        # (TODO: make more generic, since other editors will exist that are not just codemirror...)
        @set_syncstring_to_codemirror()
        # Then do the checkbox toggle.
        value = toggle_checkbox(@_syncstring.to_str(), index, checked)
        @_syncstring.from_str(value)
        @set_codemirror_to_syncstring()
        @_syncstring.save()
        @setState(value: value)

    print: (id) =>
        node = @_get_frame_node(id)
        if node.get('type') == 'cm'
            super.print(id)
            return
        html = value = undefined
        # This is kind of hackish, but it works really well.
        # The one issue would be if the same random 8-letter id happened
        # to be used twice in the same session. This is impossible right now,
        # since only one markdown viewer is in the DOM at once.
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
