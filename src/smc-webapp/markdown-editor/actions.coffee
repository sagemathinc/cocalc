###
Markdown Editor Actions
###

immutable = require('immutable')

tree_ops  = require('../code-editor/tree-ops')
{Actions} = require('../code-editor/actions')

{toggle_checkbox} = require('../tasks/desc-rendering')

class exports.Actions extends Actions
    _init: (args...) =>
        super._init(args...)   # call the _init for the parent class
        @_init_syncstring_value()
        @_init_spellcheck()

    _default_frame_tree: =>
        frame_tree = immutable.fromJS
            direction : 'col'
            type      : 'node'
            first     :
                type : 'cm'
            second    :
                type : 'markdown'
        frame_tree = tree_ops.assign_ids(frame_tree)
        frame_tree = tree_ops.ensure_ids_are_unique(frame_tree)
        return frame_tree

    toggle_markdown_checkbox: (id, index, checked) =>
        # Ensure that an editor state is saved into the
        # (TODO: make more generic, since other editors will exist that are not just codemirror...)
        @set_syncstring_to_codemirror()
        # Then do the checkbox toggle.
        value = toggle_checkbox(@_syncstring.to_str(), index, checked)
        @_syncstring.from_str(value)
        @set_codemirror_to_syncstring()
        @setState(value: value)
