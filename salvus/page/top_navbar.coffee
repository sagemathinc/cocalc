########################################################################
# top_navbar -- the top level navbar
#########################################################################

top_view = () ->
    top_navbar.switch_to_page()  # redisplay current page
    window.scrollTo(0, 0)
    return false

$("a[href=#top-scroll]").click(top_view)

$(document).on 'keydown', (ev) ->
    if (ev.metaKey or ev.ctrlKey) and ev.keyCode == 79
        return false

$(document).on 'keyup', (ev) ->
    if (ev.metaKey or ev.ctrlKey) and ev.keyCode == 79
        top_view()
        return false

misc = require("misc")
to_json = misc.to_json
defaults = misc.defaults
required = defaults.required
{EventEmitter} = require('events')

class TopNavbar  extends EventEmitter

    constructor: () ->
        @pages            = {}
        @navbar           = $(".salvus-top_navbar")
        @buttons          = @navbar.find("ul.nav.pull-left")   # the list of buttons on the left
        @buttons_right    = @navbar.find("ul.nav.pull-right")  # the list of buttons on the right
        @button_template  = $("#top_navbar-button-template")
        @divider_template = $("#top_navbar-divider-template")

    add_page: (opts) ->
        opts = defaults opts,
            page          : required   # jQuery wrapped DOM element
            id            : required   # id that client code uses to refer to this page; need not be a DOM id.
            label         : required   # jquery object that is placed in the button
            'class'       : undefined  # classes to apply to label
            insert_after  : undefined  # if given, the page is inserted after the page with given id.
            insert_before : undefined  # if given, the page is inserted before the page with given id.
            pull_right    : false      # if true, place button in the right-hand side group of buttons.
            close         : true       # if true, include a "close" x.
            onclose       : undefined  # called if defined when the page is closed
            onshow        : undefined  # called if defined right after page is shown
            onblur        : undefined  # called if defined right after page is blured

        button = @button_template.clone()
        if opts.pull_right
            @buttons_right.prepend(button)
            #button.before(@divider_template.clone())
        else
            @buttons.append(button)
            #button.after(@divider_template.clone())
        @pages[opts.id] =
            page    : opts.page
            button  : button
            onclose : opts.onclose
            onshow  : opts.onshow
            onblur  : opts.onblur

        a = button.find("a")
        a.data("id", opts.id)
        that = @
        a.click((event) -> that.switch_to_page($(this).data("id")); return false)

        @set_button_label(opts.id, opts.label, opts.class, opts.close)

    number_of_pages_left: () =>
        return @buttons.children().length

    number_of_pages_right: () =>
        return @buttons_right.children().length

    set_button_label: (id, label, klass, close=true) ->
        button = @pages[id].button
        a = button.find("a")
        a.find(".button-label").html(label)# + " &raquo;")
        close_button = a.find(".close-button")
        if close
            close_button.data("id", id)
            that = @
            close_button.click((event) -> that.remove_page($(this).data("id")); return false)
        else
            close_button.hide()
        if klass?
            a.find(".button-label").addClass(klass)
            #a.addClass(klass)

    switch_to_page: (id) ->
        if not id?
            id = @current_page_id

        n = @pages[id]
        if not n?
            return

        if id != @current_page_id
            d = @pages[@current_page_id]
            if d?
                @emit("switch_from_page-#{@current_page_id}", @current_page_id)
                d.page.hide()
                d.button.removeClass("active")
                d.onblur?()
            else
                for m, p of @pages
                    if m != id
                        p.page.hide()
                        p.button.removeClass("active")
            n.button.show().addClass("active")
            @current_page_id = id
            @emit("switch_to_page-#{id}", id)

        # We still call show even if already on this page.
        n.page.show()
        n.onshow?()

    switch_to_next_available_page: (id) ->
        # Switch to the next page after the page
        # with given id, unless there is no such page,
        # in which case, switch to the previous page.
        # This is used, e.g., when closing a tab to select a new tab.
        # This will never select the *settings tab*.
        p = @pages[id]
        next_button = p.button.next()
        next = next_button.find("a")
        nid = next.data('id')
        if nid?
            @switch_to_page(nid)
        else
            @switch_to_prev_available_page(id)

    switch_to_prev_available_page: (id) ->
        # There is always a previous page, because of the project page.
        p = @pages[id]
        prev_button = p.button.prev()
        prev = prev_button.find("a")
        id = prev.data('id')
        if id?
            @switch_to_page(id)


    # entirely remove the page
    remove_page: (id) ->
        p = @pages[id]
        if p?
            if p.onclose?
                # save unsaved work, etc.
                p.onclose()
            if p.button.hasClass("active")
                @switch_to_next_available_page(id)
            # Now actually the page
            p.page.remove()
            p.button.remove()
            delete @pages[id]

            # Now switch to the next page

    # make it so the navbar entry to go to a given page is hidden
    hide_page_button: (id) ->
        @pages[id]?.button.hide()

    # make it so the navbar entry to go to a given page is shown
    show_page_button: (id) ->
        @pages[id]?.button.show()

    # TODO -- ?
    have_unsaved_changes: (id) ->
        return false

top_navbar = exports.top_navbar = new TopNavbar()

# Make a jQuery plugin for adding dom objects to top navbar
$.fn.extend
    top_navbar: (opts) ->
        return @each () ->
            opts.page = $(this)
            top_navbar.add_page(opts)


###############################################################
# Add the standard pages

$("#about").top_navbar
    id      : "about"
    label   : "<div style='line-height:1em;text-align:center;'>SageMath<br>Cloud&trade;</div>"
    #pull_right : true
    close   : false


$("#projects").top_navbar
    id      : "projects"
    #'class' : 'navbar-big'
    label   : "<span style='font-size:12pt'><i class='icon-reorder'> </i> Projects</span>"
    #pull_right : true
    close   : false

$("#account").top_navbar
    id     : "account"
    label  : "Sign in"
    pull_right : true
    close   : false

#$("#worksheet2").top_navbar
#    id      : "worksheet2"
#    label   : "Worksheet2"
#    close   : false

#$("#worksheet1").top_navbar
#    id      : "worksheet1"
#    label   : "Worksheet1"
#    close   : false

