{EventEmitter} = require('events')

class Controller  extends EventEmitter
    constructor: (@page_ids, @default_page) ->
        @_call_when_hiding_page = {}
        @_call_when_showing_page = {}
        if not @default_page?
            @default_page = @page_ids[0]
        for p in @page_ids
            $("a[href='#"+p+"']").click((e) => @show_page(e.target.hash.slice(1)); return false)
        @show_page(@default_page)
            
    show_page: (id) ->
        @emit("show_page", id)
        @active_page = id
        for q in @page_ids
            p = "#" + q
            if q == id
                $(p).show()
                $(p+"-item").addClass("active")
                if @_call_when_showing_page[q]?
                    for f in @_call_when_showing_page[q]
                        f()
            else
                $(p).hide()
                $(p+"-item").removeClass("active")
                if @_call_when_hiding_page[q]?
                    for f in @_call_when_hiding_page[q]
                        f()

    on_hide_page: (id, f) ->
        if @_call_when_hiding_page.id?
            @_call_when_hiding_page[id].push(f)
        else
            @_call_when_hiding_page[id] = [f]

    on_show_page: (id, f) ->
        if @_call_when_showing_page.id?
            @_call_when_showing_page[id].push(f)
        else
            @_call_when_showing_page[id] = [f]
        

controller = new Controller(["about", "demo1", "demo2", "sign_in"], "sign_in")


