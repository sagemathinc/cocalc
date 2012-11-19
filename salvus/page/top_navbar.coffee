########################################################################
# top_navbar -- the top level navbar
#########################################################################
#

# global exported variable
top_navbar = undefined

(() ->
    misc = require("misc")
    to_json = misc.to_json
    defaults = misc.defaults
    required = defaults.required
    {EventEmitter} = require('events')

    
    class TopNavbar  extends EventEmitter

        constructor: () ->
            @pages            = {}
            @navbar           = $(".navbar-fixed-top")
            @buttons          = @navbar.find("ul.nav.pull-left")         # the list of buttons on the left
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
                insert_before : undefined  # if given, the page is inserted after the page with given id.
                pull_right    : false      # if true, place button in the right-hand side group of buttons.

            button = @button_template.clone()
            if opts.pull_right
                @buttons_right.append(button)
                button.before(@divider_template.clone())
            else
                @buttons.append(button)
                button.after(@divider_template.clone())
            @pages[opts.id] = {page:opts.page, button:button}

            a = button.find("a")
            a.data("id", opts.id)
            that = @
            a.click((event) -> that.switch_to_page($(this).data("id")); return false)

            @set_button_label(opts.id, opts.label, opts['class'])

        set_button_label: (id, label, klass) ->
            button = @pages[id].button
            a = button.find("a")
            a.html(label)
            if klass?
                a.addClass(klass)
                
        switch_to_page: (id) ->
            @emit("switch_to_page-#{id}", id)
            @show_page_nav(id)
            for i, d of @pages
                if i != id
                    d.page.hide()
                    d.button.removeClass("active")
                else
                    d.page.show()
                    d.button.addClass("active")

        # entirely remove the page
        remove_page: (id) ->
            p = @pages[id]
            p.page.destroy()
            p.button.destroy()
            delete @pages[id]

        # make it so the navbar entry to go to a given page is hidden
        hide_page_nav: (id) ->
            @pages[id].button.hide()

        # make it so the navbar entry to go to a given page is shown
        show_page_nav: (id) ->
            @pages[id].button.show()

        # TODO -- ?
        have_unsaved_changes: (id) ->
            return false

    top_navbar = new TopNavbar()

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
        'class' : 'brand'
        label   : "Salvus&trade;"
        
    $("#projects").top_navbar
        id      : "projects"
        'class' : 'brand'
        label   : "Projects"
        
    $("#account").top_navbar
        id     : "account"
        label  : "Sign in"
        pull_right : true


    top_navbar.hide_page_nav("projects")


)()


# TODO: temporary
#$(".project-close-button").click (e) ->
#    top_navbar.hide_page_nav("project")
#    top_navbar.switch_to_page("projects")
#    return false