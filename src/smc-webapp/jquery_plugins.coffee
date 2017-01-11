###
Misc jquery plugins
Will hopefully all go away with react rewrite.
###

$ = window.$
{defaults} = require('smc-util/misc')

$.fn.icon_spin = (start, disable = false) ->
    # when disable=true, additionally the disable-class will be added
    # don't forget to also tell it to remove later (unless it should stay disabled)
    if typeof(start) == "object"
        {start, delay} = defaults start,
            start   : true
            delay   : 0
    else
        delay = 0
    @each () ->
        elt = $(this)
        if start
            if elt.data('fa-spin')?  # means that there is a timeout that hasn't gone off yet
                return
            f = () ->
                if disable
                    elt.addClass('disabled')
                elt.data('fa-spin', null)
                if elt.find("i.fa-spinner").length == 0  # fa-spin
                    elt.append("<i class='fa fa-spinner' style='margin-left:1em'> </i>")
                    elt.find("i.fa-spinner").addClass('fa-spin')
            if delay
                elt.data('fa-spin', setTimeout(f, delay))
            else
                f()
        else
            if disable
                elt.removeClass('disabled')
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

# Use to workaround Safari flex layout bug https://github.com/philipwalton/flexbugs/issues/132
$.fn.make_height_defined = ->
    @each ->
        elt = $(this)
        # Doing this makes the height **defined**, so that flexbox can use it even on safari.
        elt.height(elt.height())
    this

$.fn.hasParent = (p) ->
    # Returns a subset of items using jQuery.filter
    @filter ->
        # Return truthy/falsey based on presence in parent
        $(p).find(this).length


