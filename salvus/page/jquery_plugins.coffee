###
Misc jquery plugins
Will hopefully all go away with react rewrite.
###

{defaults} = require('misc')

$.fn.icon_spin = (start) ->
    if typeof start == "object"
        {start,delay} = defaults start,
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
                elt.data('fa-spin',null)
                if elt.find("i.fa-spinner").length == 0  # fa-spin
                    elt.append("<i class='fa fa-spinner' style='margin-left:1em'> </i>")
                    # do not do this on Chrome, where it is TOTALLY BROKEN in that it uses tons of CPU
                    # (and the font-awesome people can't work around it):
                    #    https://github.com/FortAwesome/Font-Awesome/issues/701
                    #if not $.browser.chrome
                    ## -- re-enabling soince fontawesome 4.0 is way faster.
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

