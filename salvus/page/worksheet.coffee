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
{copy, filename_extension, required, defaults, to_json, uuid} = require('misc')

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
        @_focus_cell(@_current_cell)

    #######################################################################
    # Private Methods
    #######################################################################

    _focus_cell : (cell) ->
        if @_current_cell?
            @_current_cell.selected(false)
        @_current_cell = cell
        cell.focus()

    _next_cell : (cell) -> cell.element.next().data('cell')

    _prev_cell : (cell) -> cell.element.prev().data('cell')

    _cell_execute : (cell) ->
        next = @_next_cell(cell)
        if not next?
            next = @_append_new_cell()
        @_focus_cell(next)

    _append_new_cell: () -> @_insert_new_cell_after()

    _insert_new_cell_after : (c) ->  # appends new cell to end if c is undefined
        @opts.cell_opts.session = @opts.session
        @opts.cell_opts.id = uuid()
        cell = new Cell(@opts.cell_opts)

        if c?
            # make a sibling of c
            cell.element.insertAfter(c.element)
        else
            # append to the end of all the cells
            cell.append_to(@_cells)

        # User requested to execute the code in this cell.
        cell.on 'execute', =>
            @_cell_execute(cell)

        cell.on 'execute-running', =>
            @element.addClass("salvus-worksheet-running")

        cell.on 'execute-done', =>
            @element.removeClass("salvus-worksheet-running")

        # User requested to move to the previous cell (e.g., via up arrow).
        cell.on 'previous-cell', =>
            p = @_prev_cell(cell)
            if p?
                @_focus_cell(p)

        # User requested to move to the next cell (e.g., via down arrow).
        cell.on 'next-cell', =>
            n = @_next_cell(cell)
            if n?
                @_focus_cell(n)

        # User requested to move this cell up
        cell.on 'move-cell-up', =>
            p = @_prev_cell(cell)
            if p?
                cell.element.insertBefore(p.element)
                @_focus_cell(cell)
                @emit 'move-cell-up', cell.opts.id

        # User requested to move this cell down
        cell.on 'move-cell-down', =>
            n = @_next_cell(cell)
            if n?
                cell.element.insertAfter(n.element)
                @_focus_cell(cell)
                @emit 'move-cell-down', cell.opts.id

        cell.on 'delete-cell', =>
            if @number_of_cells() == 1
                # can't delete last cell, since worksheets always have at least one cell
                return
            @emit 'delete-cell', cell.opts.id
            cell_prev = @_prev_cell(cell)
            cell_next = @_next_cell(cell)
            note = cell.note()
            if note != ""
                if cell_next?
                    cell_next.note(note + '<br>' + cell_next.note())
                else if cell_prev?
                    cell_prev.note(cell_prev.note() + '<br>' + note)
            cell.remove()
            if cell_prev?
                @_focus_cell(cell_prev)
            else
                @_focus_cell(cell_next)

        cell.on 'split-cell', (before_cursor, after_cursor) =>
            @emit 'split-cell', cell.opts.id, before_cursor, after_cursor

        cell.on 'insert-new-cell-after', () =>
            console.log("insert-new-cell-after")
            @emit 'insert-new-cell-after', cell.opts.id
            @_focus_cell(@_insert_new_cell_after(cell))

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

    number_of_cells: () ->
        return @_cells.find(".salvus-cell").length



exports.Worksheet = Worksheet

$.fn.extend
    salvus_worksheet: (opts={}) ->
        @each () ->
            opts0 = copy(opts)
            opts0.element = this
            $(this).data('worksheet', new Worksheet(opts0))
