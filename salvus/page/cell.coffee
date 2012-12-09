######################################################
#
# A Compute Cell
#
######################################################

# imports
{EventEmitter} = require('events')

{required, defaults} = require('misc')

{local_diff} = require('misc_page')


# templates
templates     = $("#salvus-cell-templates")
cell_template = templates.find(".salvus-cell")

# the Cell class
class Cell extends EventEmitter
    constructor: (opts={}) ->
        @opts = defaults opts,
            element               : required   # DOM element (or jquery wrapped element); this is replaced by the cell

            note_change_timer     : 250        # milliseconds interval between sending update change events about note
            note_max_height       : "auto"     # maximum height of note part of cell.
            note_value            : ""         # initial value of the note (HTML)

            editor_mode           : "python"   # language mode of the input editor
            editor_line_numbers   : false      # whether to display line numbers in the input code editor
            editor_indent_spaces  : 4          # number of spaces to indent in the code editor
            editor_line_wrapping  : true       # whether or not to wrap lines in the code editor
            editor_undo_depth     : 40         # undo depth for code editor
            editor_match_brackets : true       # whether to do bracket matching in the code editor
            editor_max_height     : "20em"     # css maximum height of code editor (scroll bars appear beyond this)
            editor_value          : ""         # initial value of the code editor (TEXT)

            output_max_height     : "20em"     # maximum height of output (scroll bars appear beyond this)
            output_line_wrapping  : false      # whether or not to wrap lines in the output; if not wrapped, scrollbars appear
            output_value          : ""         # initial value of the output area (HTML)

        @_note_change_timer_is_set = false

        @element = cell_template.clone()
        @_initialize_note()
        @_initialize_code_editor()

        @element.data("cell", @)
        $(@opts.element).replaceWith(@element)

        @refresh()
        @_cm.setValue(@opts.editor_value)

    append_to: (e) ->
        @element.append(e)

    _initialize_note: () ->
        # make note fire change event when changed
        @_note = @element.find(".salvus-cell-note")
        @_note.css('max-height', @opts.note_max_height)
        that = @
        @_note.live('focus', ->
            $this = $(this)
            $this.data('before', $this.html())
        ).live('paste blur keyup', () ->
            if not that._note_change_timer_is_set
                that._note_change_timer_is_set = true
                setTimeout( (() ->
                    that._note_change_timer_is_set = false
                    before = that._note.data('before')
                    now    = that._note.html()
                    if before isnt now
                        that.emit('change', {'note':local_diff(before, now)})
                        that._note.data('before', now)
                    ),
                    that.opts.note_change_timer
                )
        )

    _initialize_code_editor: () ->
        @_code_editor = @element.find(".salvus-cell-code-editor")
        @_cm = CodeMirror.fromTextArea @_code_editor[0],
            firstLineNumber : 1
            autofocus       : false
            mode            : @opts.editor_mode
            lineNumbers     : @opts.editor_line_numbers
            indentUnit      : @opts.editor_indent_spaces
            tabSize         : @opts.editor_indent_spaces
            lineWrapping    : @opts.editor_line_wrapping
            undoDepth       : @opts.editor_undo_depth
            matchBrackets   : @opts.editor_match_brackets
        $(@_cm.getWrapperElement()).addClass('salvus-cell-code-editor')
        $(@_cm.getScrollerElement()).css('max-height' : @opts.editor_max_height)

    refresh: () ->
        @_cm.refresh()

    select: () ->
        $(@_cm.getWrapperElement()).addClass('salvus-cell-code-editor-selected')


exports.Cell = Cell

$.fn.extend
    salvus_cell: (opts={}) ->
        @each () ->
            opts.element = this
            $(this).data('cell', new Cell(opts))

