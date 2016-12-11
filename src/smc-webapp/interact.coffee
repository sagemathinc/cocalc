###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################


###
Interact -- Client side of interact implementation.

This file defines a jQuery plugin ".sage_interact(...)" that replaces a DOM element
by one with interactive controls and output.
###

$ = window.$

misc = require('smc-util/misc')

{defaults, required} = misc

# Interact jQuery plugin
$.fn.extend
    sage_interact: (opts) ->
        opts = defaults opts,     # see comments for Interact below.
            desc                : required
            execute_code        : required
            process_output_mesg : required
            process_html_output : required
            start               : undefined
            stop                : undefined

        @each () ->
            elt      = $(this)
            opts.elt = elt
            interact = new Interact(opts)
            elt.data("interact", interact)
            return interact.element

templates = $(".salvus-interact-templates")

class Interact
    constructor: (opts) ->
        @opts = defaults opts,
            # elt = a jQuery wrapped DOM element that will be replaced by the interact
            elt  : required
            # desc = an object that describes the interact controls, etc.
            desc : required
            # execute_code = sage code executor; function that can be called like this
            #        (see the execute_code message in message.coffee):
            #
            #        id = execute_code(code:?, data:?, preparse:?, cb:(mesg) => )
            #
            execute_code : required
            #
            # process_output_mesg = message to deal with output from execute_code
            #           process_output_mesg(element:jQuery wrapped output DOM element, mesg:message output from execute_code)

            process_output_mesg : required
            process_html_output : required

            # start(@) called when execution of code starts due to user manipulating a control
            start : undefined
            # stop(@) called when execution stops
            stop : undefined

        @element = templates.find(".salvus-interact-container").clone()
        @element.attr('id', opts.desc.id).data('interact', @)
        @opts.elt.replaceWith(@element)
        @initialize_interact()

    set_interact_var: (control_desc) =>
        var0 = control_desc.var

        controls = @element.find(".salvus-interact-var-#{var0}")
        if controls.length > 0
            # There is already (at least) one control location with this name
            for C in controls
                control = $(C).find(':first-child')
                if control.length > 0
                    control.data("set")(control_desc.default)
                else
                    # No control yet, so make one.
                    new_control = interact_control(control_desc, @element.data('update'), @opts.process_html_output)
                    $(C).append(new_control)
                    new_control.data('refresh')?()
        else
            # No controls with this name or even place to put it.
            row       = $("<div class='row'></div>")
            container = $("<div class='salvus-interact-var-#{var0}'></div>")
            row.append(container)
            new_control = interact_control(control_desc, @element.data('update'), @opts.process_html_output)
            if new_control?
                container.append(new_control)
                @element.append(row)
                new_control.data('refresh')?()

    del_interact_var: (arg) =>
        @element.find(".salvus-interact-var-#{arg}").remove()

    initialize_interact: () =>
        desc = @opts.desc

        # Canonicalize width
        desc.width = parse_width(desc.width)

        # Create the fluid bootstrap layout canvas.
        labels = {}
        for row in desc.layout
            fluid_row = $("<div class='row'>")
            if row.length == 0 # empty row -- user wants space
                fluid_row.append($("<br>"))
            else
                for x in row
                    arg = x[0]; span = x[1]; label = x[2]
                    if label?
                        labels[arg] = label
                    t = $("<div class='col-sm-#{span} salvus-interact-var-#{arg}'></div>")
                    fluid_row.append(t)
            @element.append(fluid_row)

        # Create cell for the output stream from the function to appear in, if it is defined above
        output = @element.find(".salvus-interact-var-")   # empty string is output

        # Define the update function, which communicates with the server.
        done = true
        update = (vals) =>
            # FUTURE: flicker?
            #for output_cell in output_cells
            #    if not desc.flicker
            #        height = output_cell._output.height()
            #        output_cell._output.css('min-height', height)
            #    output_cell.delete_output()
            output.html("")

            done = false
            first = true
            @opts.execute_code
                code      : 'salvus._execute_interact(salvus.data["id"], salvus.data["vals"])'
                data      : {id:desc.id, vals:vals}
                preparse  : false
                cb        : (mesg) =>
                    if first
                        @opts.start?()
                        first = false

                    @opts.process_output_mesg(mesg:mesg, element:output)

                    if mesg.done
                        # stop the stopwatch
                        @opts.stop?()
                        done = true

        # Define the controls.
        created_controls = []
        for control_desc in desc.controls
            containing_div = @element.find(".salvus-interact-var-#{control_desc.var}")
            if labels[control_desc.var]?
                control_desc.label = labels[control_desc.var]
            for X in containing_div
                c = interact_control(control_desc, update, @opts.process_html_output)
                created_controls.push(c)
                $(X).append(c)

        # Refresh any controls that need refreshing
        for c in created_controls
            c.data('refresh')?()

        @element.attr('style', desc.style)
        @element.data('update', update)

        if desc.width?
            @element.width(desc.width)

        update({})



parse_width = (width) ->
    if width?
        if typeof width == 'number'
            return "#{width}ex"
        else
            return width

interact_control = (desc, update, process_html_output) ->
    # Create and return a detached DOM element elt that represents
    # the interact control described by desc.  It will call update
    # when it changes.  If @element.data('refresh') is defined, it will
    # be called after the control is inserted into the DOM.

    # Generic initialization code
    control = templates.find(".salvus-interact-control-#{desc.control_type}").clone()
    if control.length == 0
        # nothing to do -- the control no longer exists (deprecated?)
        # WARNING: we should probably send a message somewhere saying this no longer exists.
        return
    if desc.label?
        control.find(".salvus-interact-label").html(desc.label).mathjax()

    # Initialization specific to each control type
    set = undefined
    send = (val) ->
        vals = {}
        vals[desc.var] = val
        update(vals)

    desc.width = parse_width(desc.width)

    switch desc.control_type
        when 'input-box'
            last_sent_val = undefined
            do_send = () ->
                val = input.val()
                last_sent_val = val
                send(val)

            if desc.nrows <= 1
                input = control.find("input").show()
                input.keypress (evt) ->
                    if evt.which == 13
                        do_send()
            else
                input = control.find("textarea").show().attr('rows', desc.nrows)
                desc.submit_button = true
                input.keypress (evt) ->
                    if evt.shiftKey and evt.which == 13
                        do_send()
                        return false

            set = (val) ->
                input.val(val)
                process_html_output(input)

            input.on 'blur', () ->
                if input.val() != last_sent_val
                    do_send()

            if desc.submit_button
                submit = control.find(".salvus-interact-control-input-box-submit-button").show()
                submit.find("a").click(() -> send(input.val()))

            if desc.readonly
                input.attr('readonly', 'readonly')
            input.width(desc.width)


        when 'checkbox'
            input = control.find("input")
            set = (val) ->
                input.attr('checked', val)
            input.click (evt) ->
                send(input.is(':checked'))
            if desc.readonly
                input.attr('disabled', 'disabled')

        when 'button'
            button = control.find("a")
            if desc.classes
                for cls in desc.classes.split(/\s+/g)
                    button.addClass(cls)
            if desc.width
                button.width(desc.width)
            if desc.icon
                button.find('i').addClass(desc.icon)
            else
                button.find('i').hide()
            button.click (evt) -> send(null)
            set = (val) ->
                button.find("span").html(val).mathjax()

        when 'text'
            text = control.find(".salvus-interact-control-content")
            if desc.classes
                for cls in desc.classes.split(/\s+/g)
                    text.addClass(cls)

            # This is complicated because we shouldn't run mathjax until
            # the element is visible.
            set = (val) ->
                if text.data('val')?
                    # it has already appeared, so safe to mathjax immediately
                    text.html(val)
                    process_html_output(text)
                    text.mathjax()

                text.data('val', val)

            control.data 'refresh', () ->
                text.mathjax(tex:text.data('val'))

        when 'input-grid'
            grid = control.find(".salvus-interact-control-grid")

            entries = []
            for i in [0...desc.nrows]
                for j in [0...desc.ncols]
                    cell = $('<input type="text">').css("margin","0")
                    if desc.width
                        cell.width(desc.width)
                    cell.keypress (evt) ->
                        if evt.which == 13
                            send_all()
                    grid.append(cell)
                    entries.push(cell)
                grid.append($('<br>'))

            send_all = () ->
                send( (cell.val() for cell in entries) )

            control.find("a").click () ->
                send_all()

            set = (val) ->
                cells = grid.find("input")
                i = 0
                for r in val
                    for c in r
                        $(cells[i]).val(c).data('last',c)
                        i += 1

        when 'color-selector'
            input = control.find("input").colorpicker()
            sample = control.find("i")
            input.change (ev) ->
                hex = input.val()
                input.colorpicker('setValue', hex)
            input.on "changeColor", (ev) ->
                hex = ev.color.toHex()
                sample.css("background-color", hex)
                send(hex)
            sample.click (ev) -> input.colorpicker('show')
            set = (val) ->
                input.val(val)
                sample.css("background-color", val)
            if desc.hide_box
                input.parent().width('1px')
            else
                input.parent().width('9em')

        when 'slider'
            content = control.find(".salvus-interact-control-content")
            slider  = content.find(".salvus-interact-control-slider")
            value   = control.find(".salvus-interact-control-value")
            if desc.width?
                slider.width(desc.width)
            slider.slider
                animate : desc.animate
                min     : 0
                max     : desc.vals.length-1
                step    : 1
                value   : desc.default
                change  : (event, ui) ->
                    if desc.display_value
                        value.text(desc.vals[ui.value])
                    if event.altKey?
                        # This is a genuine event by user, not the result of calling "set" below.
                        send(ui.value)

            set = (val) ->
                slider.slider('value', val)

        when 'range-slider'
            content = control.find(".salvus-interact-control-content")
            slider  = content.find(".salvus-interact-control-slider")
            value   = control.find(".salvus-interact-control-value")
            if desc.width
                content.width(desc.width)
            slider.slider
                animate : desc.animate
                range   : true
                min     : 0
                max     : desc.vals.length-1
                step    : 1
                values  : desc.default
                change  : (event, ui) ->
                    if desc.display_value
                        v = slider.slider("values")
                        value.text("#{desc.vals[v[0]]} - #{desc.vals[v[1]]}")
                    if event.altKey?
                        # This is a genuine event by user, not calling "set" below.
                        send(slider.slider("values"))

            set = (val) ->
                slider.slider('values', val)

        when 'selector'
            content = control.find(".salvus-interact-control-content")
            if desc.buttons or desc.nrows != null or desc.ncols != null
                content.addClass('salvus-interact-control-selector-buttonbox')
                ########################
                # Buttons.
                ########################
                if desc.ncols != null
                    ncols = desc.ncols
                else if desc.nrows != null
                    ncols = Math.ceil(desc.lbls.length/desc.nrows)
                else
                    ncols = desc.lbls.length

                multi_row = (desc.lbls.length > ncols)

                bar = $('<span>')
                if multi_row
                    bar.addClass('btn-group')
                content.append(bar)

                i = 0
                for lbl in desc.lbls
                    button = $("<a class='btn btn-default'>").data('value',i).text(lbl)
                    if desc.button_classes != null
                        if typeof desc.button_classes == "string"
                            c = desc.button_classes
                        else
                            c = desc.button_classes[i]
                        for cls in c.split(/\s+/g)
                            button.addClass(cls)
                    if desc.width
                        button.width(desc.width)
                    button.click () ->
                        val = $(@).data('value')
                        send(val)
                        set(val)
                    bar.append(button)
                    i += 1
                    if i % ncols == 0 and i < desc.lbls.length
                        # start a new row in the button bar
                        content.append($('<br>'))
                        bar = $('<span class="btn-group">')
                        content.append(bar)

                control.data 'refresh', () ->
                    if ncols != desc.lbls.length and not desc.width
                        # If no width param is specified and the
                        # button bar will take up multiple lines, make
                        # all buttons the same width as the widest, so
                        # the buttons look nice.
                        w = Math.max.apply @, ($(x).width() for x in content.find("a"))
                        content.find("a").width(w)

                set = (val) ->
                    content.find("a.active").removeClass("active")
                    $(content.find("a")[val]).addClass("active")
            else
                # A standard drop down selector box.
                select = $("<select>")
                content.append(select)
                i = 0
                for lbl in desc.lbls
                    select.append($("<option>").attr("value",i).attr("label", lbl).text(lbl))
                    i += 1

                select.change (evt) ->
                    send(select.find(":selected").attr("value"))

                if desc.width
                    select.width(desc.width)

                set = (val) ->
                    if typeof val == 'number'
                        $(select.children()[val]).attr("selected", true)
                    else
                        val = String(val)
                        for opt in select.find("option")
                            opt = $(opt)
                            if opt.attr("value") == val
                                opt.attr("selected", true)
        else
            throw("Unknown interact control type '#{desc.control_type}'")

    # fix HTML links and <img src=...> in interacts, but not additionally in nested ones (e.g. %exercise)
    e = $('<div>').html(desc.default)
    process_html_output(e)
    set(e.html())
    control.data("set", set)
    return control

