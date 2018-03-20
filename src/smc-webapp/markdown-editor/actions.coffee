###
Markdown Editor Actions
###

immutable = require('immutable')

tree_ops  = require('../code-editor/tree-ops')
{Actions} = require('../code-editor/actions')

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
        