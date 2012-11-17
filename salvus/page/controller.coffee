{EventEmitter} = require('events')

class Controller  extends EventEmitter
    constructor: (@page_ids, @default_page) ->
        if not @default_page?
            @default_page = @page_ids[0]
        for id in @page_ids
            $("a[href='##{id}']").click (e) =>
                @switch_to_page(e.target.hash.slice(1))
                return false
            @_hide_page(id)
        @switch_to_page(@default_page)

    _hide_page: (id) -> 
        @emit("hide_page_#{id}", id)
        $("##{id}").hide()
        $("##{id}-item").removeClass("active")

    _show_page: (id) ->
        $("##{id}").show()
        $("##{id}-item").addClass("active")
        @emit("show_page_#{id}", id)
        
    switch_to_page: (id) ->
        @show_page_nav(id)
        for page in @page_ids
            if page == id
                @_show_page(id)
            else if @active_page == page
                @_hide_page(page)
        @active_page = id

    # make it so the navbar entry to go to a given page is hidden
    hide_page_nav: (id) ->
        $("##{id}-item").hide()

    # make it so the navbar entry to go to a given page is shown
    show_page_nav: (id) ->
        $("##{id}-item").show()

    have_unsaved_changes: (id) ->
        # TODO: obviously, just for testing.
        return $("#output2").val() != ""


controller = new Controller(["about", "demo1", "demo2", "account", "projects", "project", "files"], "account")

controller.hide_page_nav("demo1")
controller.hide_page_nav("demo2")
controller.hide_page_nav("projects")
controller.hide_page_nav("project")
controller.hide_page_nav("files")

# TODO: select a specific page/view for testing
# controller.switch_to_page("feedback")
#
