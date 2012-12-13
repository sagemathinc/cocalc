###########################################
#
# Salvus interactive worksheet editor
#
# Namespaces:
#
#   * worksheet.css: all css classes are prefixed with "salvus-worksheet-"
#
#   * worksheet.html: do not use any id's -- use css classes prefixed as above
#
#   * worksheet.coffee: The only Javascript exported from this file is via
#     assignment to the exports objects
#
###########################################
#

{EventEmitter} = require('events')
{copy, filename_extension, required, defaults, to_json} = require('misc')

{Cell} = require("cell")

templates          = $("#salvus-worksheet-templates")
worksheet_template = templates.find(".salvus-worksheet")

# Worksheet class
class Worksheet extends EventEmitter
    constructor: (opts={}) ->
        @opts = defaults opts,
            element     : required # DOM element (or jQuery wrapped element); this is replaced by the worksheet
            title       : ""
            description : ""
            cell_opts   : {}
            session     : undefined

        @element = worksheet_template.clone()
        @element.data("worksheet", @)
        $(@opts.element).replaceWith(@element)
        @set_title(@opts.title)
        @set_description(@opts.description)
        @_cells = @element.find(".salvus-worksheet-cells")
        @_current_cell = @_append_new_cell()

    #######################################################################
    # Private Methods
    #######################################################################

    _focus_cell : (cell) ->
        if @_current_cell?
            @_current_cell.selected(false)
        @_current_cell = cell
        cell.focus()

    _next_cell : (cell) -> cell.element.next().data('cell')

    _cell_execute : (cell) ->
        console.log('execute', cell)
        next = @_next_cell(cell)
        if not next?
            next = @_append_new_cell()
        @_focus_cell(next)

    _append_new_cell : () ->
        @opts.cell_opts.session = @opts.session
        cell = new Cell(@opts.cell_opts)
        cell.append_to(@_cells)
        cell.on('execute', => @_cell_execute(cell))
        return cell


    #######################################################################
    # Public API
    # Unless otherwise stated, these methods can be chained.
    #######################################################################
    set_title: (title) ->
        @element.find(".salvus-worksheet-title").html(title)

    set_description: (description) ->
        @element.find(".salvus-worksheet-description").html(description)

    set_session: (session) ->
        @opts.session = session
        for c in @cells()
            c.set_session(session)

    # Return ordered array of the current cell objects (these are classes not DOM elements).
    cells: () ->
        return ($(c).data('cell') for c in @_cells.find(".salvus-cell"))





exports.Worksheet = Worksheet

$.fn.extend
    salvus_worksheet: (opts={}) ->
        @each () ->
            opts0 = copy(opts)
            opts0.element = this
            $(this).data('worksheet', new Worksheet(opts0))
