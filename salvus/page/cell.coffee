######################################################
#
# A Cell
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
        @element = cell_template.clone()
        @element.data("Cell", @)
        $(opts.element).replaceWith(@element)
        @set_input(opts.input)

    set_input: (input) ->
        @element.find(".salvus-cell-input").text(input)

exports.Cell = Cell

$.fn.extend
    salvus_cell: (opts) ->
        @each () ->
            opts.element = this
            new Cell(opts)

