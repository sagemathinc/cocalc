######################################################
#
# A Compute Cell
#
######################################################

# imports
{EventEmitter} = require('events')

{required, defaults} = require('misc')

{diff} = require('misc_page')


# templates
templates     = $("#salvus-cell-templates")
cell_template = templates.find(".salvus-cell")

# the Cell class
class Cell extends EventEmitter
    constructor: (opts={}) ->
        @opts = defaults opts,
            element           : required
            note_change_timer : 250   # 100 ms
            line_numbers      : false
            indent_unit       : 4
            line_wrapping     : true
            undo_depth        : 40
            match_brackets    : true
            input_max_height  : "30em"
            output_max_height : "30em"
        @_note_change_timer_is_set = false
        @_create_dom_element()
        @element.data("cell", @)
        $(@opts.element).replaceWith(@element)

    append_to: (e) ->
        @element.append(e)

    _create_dom_element: () ->
        @element = cell_template.clone()
        @_initialize_note()
        @_initialize_input()

    _initialize_note: () ->
        # make note fire change event when changed
        @_note = @element.find(".salvus-cell-note")
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
                        that.emit('change', {'note':diff(before, now)})
                        that._note.data('before', now)
                    ),
                    that.opts.change_timer
                )
        )

    _initialize_input: () ->
        @_input = @element.find(".salvus-cell-input")
        @_cm = CodeMirror.fromTextArea @_input[0],
            mode            : "python"
            lineNumbers     : @opts.line_numbers
            firstLineNumber : 1
            indentUnit      : @opts.indent_unit
            tabSize         : @opts.indent_unit
            lineWrapping    : @opts.line_wrapping
            undoDepth       : @opts.undo_depth
            autofocus       : false
            matchBrackets   : @opts.match_brackets

exports.Cell = Cell

$.fn.extend
    salvus_cell: (opts={}) ->
        @each () ->
            opts.element = this
            new Cell(opts)

