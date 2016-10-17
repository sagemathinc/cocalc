###
Misc jquery plugins
Will hopefully all go away with react rewrite.
###

$ = window.$
{defaults} = require('smc-util/misc')

$.fn.icon_spin = (start) ->
    if typeof(start) == "object"
        {start, delay} = defaults start,
            start : true
            delay : 0
    else
        delay = 0
    @each () ->
        elt = $(this)
        if start
            if elt.data('fa-spin')?  # means that there is a timeout that hasn't gone off yet
                return
            f = () ->
                elt.data('fa-spin', null)
                if elt.find("i.fa-spinner").length == 0  # fa-spin
                    elt.append("<i class='fa fa-spinner' style='margin-left:1em'> </i>")
                    elt.find("i.fa-spinner").addClass('fa-spin')
            if delay
                elt.data('fa-spin', setTimeout(f, delay))
            else
                f()
        else
            t = elt.data('fa-spin')
            if t?
                clearTimeout(t)
                elt.data('fa-spin',null)
            elt.find("i.fa-spinner").remove()


# Expand element to be vertically maximal in height, keeping its current top position.
$.fn.maxheight = (opts={}) ->
    if not opts.offset?
        opts.offset = 0
    @each ->
        elt = $(this)
        elt.height($(window).height() - elt.offset().top - opts.offset)
    this

$.fn.hasParent = (p) ->
    # Returns a subset of items using jQuery.filter
    @filter ->
        # Return truthy/falsey based on presence in parent
        $(p).find(this).length


