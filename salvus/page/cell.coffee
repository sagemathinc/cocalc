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
        @_note_change_timer_is_set = false
        @_create_dom_element()
        @element.data("cell", @)
        $(@opts.element).replaceWith(@element)

    append_to: (e) ->
        @element.append(e)

    _create_dom_element: () ->
        that = @
        e = cell_template.clone()

        # make note fire change event when changed
        @_note = e.find(".salvus-cell-note")
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

        @element = e

    set_input: (input) ->
        @element.find(".salvus-cell-input").text(input)

exports.Cell = Cell

$.fn.extend
    salvus_cell: (opts={}) ->
        @each () ->
            opts.element = this
            new Cell(opts)

