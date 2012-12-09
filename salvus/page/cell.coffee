######################################################
#
# A Compute Cell
#
######################################################

{required, defaults} = require('misc')
templates = $("#salvus-cell-templates")
cell_template = templates.find(".salvus-cell")

class Cell
    constructor: (opts={}) ->
        opts = defaults opts,
            element: required
            input  : ""
        @_create_dom_element()
        @element.data("cell", @)
        $(opts.element).replaceWith(@element)
        @set_input(opts.input)

    append_to: (e) ->
        @element.append(e)

    _create_dom_element: () ->
        e = cell_template.clone()
        @element = e

    set_input: (input) ->
        @element.find(".salvus-cell-input").text(input)

exports.Cell = Cell

$.fn.extend
    salvus_cell: (opts) ->
        @each () ->
            opts.element = this
            new Cell(opts)

