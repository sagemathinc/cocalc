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
{merge, copy, filename_extension, required, defaults, to_json, uuid} = require('misc')
{alert_message} = require('alerts')

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
            content     : undefined  # If given, sets the cells/sections of the worksheet (see @to_obj()).
            cell_opts   : {}
            session     : undefined
            path        : undefined  # If given, is the default filename of the worksheet; containing directory is chdir'd on startup.

        @element = worksheet_template.clone()
        @element.data("worksheet", @)
        $(@opts.element).replaceWith(@element)
        @set_title(@opts.title)
        @set_description(@opts.description)
        @_cells = @element.find(".salvus-worksheet-cells")
        @_current_cell = @_append_new_cell()
        @_focus_cell(@_current_cell)

        @_init_section_button()
        @_init_filename_save()

        if @opts.content?
            # Set the contents of the worksheet, then *delete* this
            # attribute, since it would be wasted and could be
            # misleading, unless we try to keep it in sync with the
            # DOM, which would be further
            # wasteful/misleading/hard/error prone.
            @set_content(@opts.content)
            delete @opts.content

    #######################################################################
    # Private Methods
    #######################################################################
    #
    _save: (filename) =>
        if filename == ""
            alert_message(type:'error', message:"You must enter a filename in order to save your worksheet.")
            return
        console.log("save to #{filename}")

    _init_filename_save: () =>
        input = @element.find(".salvus-worksheet-filename")
        if @opts.path?
            input.val(@opts.path)
        input.keypress (evt) =>
            if evt.which == 13
                @_save(input.val())
                return false
        @element.find("a[href=#save]").click () =>
            @_save(input.val())
            return false

    _init_section_button: () =>
        @element.find("a[href=#section]").click () =>
            @_create_section()
            return false

    _new_section: (opts={}) =>
        opts = defaults opts,
            id    : undefined
            title : 'Section'
        section = templates.find(".salvus-worksheet-section").clone()
        if not opts.id?
            opts.id = uuid()
        section.attr('id', opts.id)

        if opts.title?
            section.find(".salvus-worksheet-section-title-user").html(opts.title)

        section.find(".salvus-worksheet-section-hide").click () ->
            section.find(".salvus-worksheet-section-hide").hide()
            section.find(".salvus-worksheet-section-show").show()
            section.find(".salvus-worksheet-section-cells").hide()

        section.find(".salvus-worksheet-section-show").click () ->
            section.find(".salvus-worksheet-section-show").hide()
            section.find(".salvus-worksheet-section-hide").show()
            section.find(".salvus-worksheet-section-cells").show()

        section.find(".salvus-worksheet-section-hide")

        section.find(".salvus-worksheet-section-title-user").blur () ->
            t = $(@)
            if $.trim(t.text()) == ""
                if section.find(".salvus-cell").length == 0
                    section.remove()
                else
                    t.text("...")
        return section

    _create_section: () =>
        group = []
        n = 0
        cells = @cells()
        for c in cells
            n += 1
            end_group = false
            if c.checkbox()
                group.push(c)
                c.checkbox(false)
            else
                end_group = true
            if n == cells.length
                end_group = true
            if end_group
                if group.length > 0
                    # found a new group
                    section = @_new_section()
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

    _next_cell : (cell) ->
        e = cell.element[0]
        this_one = false
        for elt in @_cells.find(".salvus-cell:visible")
            if this_one
                return $(elt).data("cell")
            if elt == e
                this_one = true

    _prev_cell : (cell) ->
        e = cell.element[0]
        this_one = false
        last = undefined
        for elt in @_cells.find(".salvus-cell:visible")
            if elt == e
                this_one = true
                return $(last).data("cell")
            last = elt


    _append_new_cell: () -> @_insert_new_cell(location:'end')

    _new_cell: (obj) =>
        opts = copy(@opts.cell_opts)
        opts.session = @opts.session
        if obj?
            merge(opts, obj)
        else
            opts.id = uuid()

        cell = new Cell(opts)

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
        cell.on 'next-cell', (create) =>
            n = @_next_cell(cell)
            if not n? and create? and create
                n = @_append_new_cell()
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

            t = to_json(@to_obj())
            localStorage.worksheet = t
            console.log(t)

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


    _insert_new_cell : (opts) =>
        opts = defaults opts,
            location    : required   # 'before', 'after', 'end', 'beginning'
            cell        : undefined  # must give if location='before' or 'after'.

        # appends new cell to end if c is undefined
        cell = @_new_cell()

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

        return cell

    _to_obj: (c) =>
        console.log('_to_obj: ', c)
        # c is a DOM object (not jQuery wrapped), which defines
        # either a section or cell.
        c = $(c)
        if c.hasClass("salvus-worksheet-section")
            # It is a section
            title = c.find(".salvus-worksheet-section-title-user").html()
            console.log('children of section =', c.find(".salvus-worksheet-section-cells").children())
            content = (@_to_obj(d) for d in $(c.find(".salvus-worksheet-section-cells")[0]).children())
            return {title: title,  content: content, id:c.attr("id")}
        else
            # It is a cell
            return c.data('cell').to_obj()

    # Append the cells/sections/etc. defined by the object c to the
    # DOM element elt, which must be jQuery wrapped.
    _append_content: (elt, content) =>
        # content = list of objects that defines cells and sections
        console.log("content = ", content)
        for c in content
            if c.content?  # c defines a section, since it has content
                console.log("new section = ", c)
                section = @_new_section(id: c.id, title:c.title)
                section_cells = section.find(".salvus-worksheet-section-cells")
                elt.append(section)
                # Now append the cells (and sections) inside this section
                @_append_content(section_cells, c.content)
            else
                console.log("new cell = ", c)
                # c defines a cell.
                cell = @_new_cell(c)
                elt.append(cell.element)
                cell.refresh()

    #######################################################################
    # Public API
    # Unless otherwise stated, these methods can be chained.
    #######################################################################

    # convert worksheet to object
    to_obj: () =>
        obj =
            title       : @get_title()
            description : @get_description()
            content     : (@_to_obj(c) for c in @_cells.children())
        return obj

    # Given worksheet content as returned by to_obj() above, rebuilt
    # the worksheet part of the DOM from scratching using this
    # content.
    set_content: (content) =>
        # Delete everything from the worksheet contents DOM.
        @_cells.children().remove()
        # Iterate through content adding sections and cells
        @_append_content(@_cells, content)

    set_title: (title) =>
        @element.find(".salvus-worksheet-title").html(title)

    get_title: () =>
        @element.find(".salvus-worksheet-title").html()

    set_description: (description) ->
        @element.find(".salvus-worksheet-description").html(description)

    get_description: (description) ->
        @element.find(".salvus-worksheet-description").html()

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
