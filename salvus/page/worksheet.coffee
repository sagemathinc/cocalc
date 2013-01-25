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

        @element.find("a[href=#section]").click () =>
             @_create_section()
            return false

    #######################################################################
    # Private Methods
    #######################################################################
    #

    _create_section: () =>
        console.log("_create_section")
        group = []
        for c in @cells()
            if c.checkbox()
                group.push(c)
            else
                if group.length > 0
                    # found a new group
                    section = templates.find(".salvus-worksheet-section").clone()
                    section.insertBefore(group[0].element)
                    section_cells = section.find(".salvus-worksheet-section-cells")
                    for x in group
                        section_cells.append(x.element)
                group = []

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

    _append_new_cell: () -> @_insert_new_cell(location:'end')

    _insert_new_cell : (opts) ->
        opts = defaults opts,
            location    : required   # 'before', 'after', 'end', 'beginning'
            cell        : undefined  # must give if location='before' or 'after'.
        # appends new cell to end if c is undefined
        @opts.cell_opts.session = @opts.session
        @opts.cell_opts.id = uuid()
        cell = new Cell(@opts.cell_opts)

        switch opts.location
            when 'after'
                # make sibling directly after cell
                cell.element.insertAfter(opts.cell.element)
            when 'before'
                # make sibling directly before cell
                cell.element.insertBefore(opts.cell.element)
            when 'end'
                # append as the last cell
                cell.append_to(@_cells)
            when 'beginning'
                cell.prepend_to(@_cells)
            else
                throw("invalid input to _insert_new_cell #{to_json(opts)}")

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
            # Create new cell after this one.
            new_cell = @_insert_new_cell(location:'after', cell:cell)
            # Move all text after cursor in this cell to beginning of new cell
            new_cell.input(after_cursor)
            new_cell.append_to_output(cell.output().children().detach())
            cell.input(before_cursor)
            @_focus_cell(new_cell)


        cell.on 'insert-new-cell-before', () =>
            @emit 'insert-new-cell-before', cell.opts.id
            @_focus_cell(@_insert_new_cell(location:'before', cell:cell))

        cell.on 'insert-new-cell-after', () =>
            @emit 'insert-new-cell-after', cell.opts.id
            @_focus_cell(@_insert_new_cell(location:'after', cell:cell))

        cell.on 'join-with-prev', () =>
            @emit 'join-with-prev', cell.opts.id
            prev_cell = @_prev_cell(cell)
            if not prev_cell?
                # If there is no cell above this one, do nothing.
                return
            # Copy note contents to end of note of cell above.
            note = $.trim(cell.note())
            if note.length > 0
                prev_cell.note(prev_cell.note() + '<br>' + note)
            # Copy input to end of input above.
            prev_cell.append_to_input("\n" +cell.input())
            # Copy output to end of output above
            prev_cell.append_to_output(cell.output())
            # Delete this cell
            cell.remove()
            # Focus cell above
            @_focus_cell(prev_cell)


        cell.on 'checkbox-change', (shift) =>
            if shift and @last_checked_cell
                # Select everything between cell and last_checked_cell.
                checking = false
                new_state = cell.checkbox()
                for c in @cells()
                    if c == @last_checked_cell or c == cell
                        c.checkbox(new_state)
                        if not checking
                            checking = true
                        else
                            break
                    if checking
                        c.checkbox(new_state)
            @last_checked_cell = cell

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
