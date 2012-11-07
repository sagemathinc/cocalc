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
        @emit("show_page_#{id}", id)
        $("##{id}").show()
        $("##{id}-item").addClass("active")
        
    switch_to_page: (id) ->
        for page in @page_ids
            if page == id
                @_show_page(id)
            else if @active_page == page
                @_hide_page(page)
        @active_page = id

    have_unsaved_changes: (id) ->
        # TODO: obviously, just for testing.
        return $("#output2").val() != ""


controller = new Controller(["about", "demo1", "demo2", "sign_in"], "sign_in")
