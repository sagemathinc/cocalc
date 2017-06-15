$ = window.$
async = require('async')
{FileEditor} = require('../editor')
{PDFLatexDocument} = require('./document')
{defaults, required} = misc = require('smc-util/misc')

templates = $("#webapp-editor-templates")

class exports.PNG_Preview extends FileEditor
    constructor: (@project_id, @filename, contents, opts) ->
        super(@project_id, @filename)
        @pdflatex = new PDFLatexDocument(project_id:@project_id, filename:@filename, image_type:"png")
        @opts = opts
        @_updating = false
        @element = templates.find(".webapp-editor-pdf-preview").clone()
        @spinner = @element.find(".webapp-editor-pdf-preview-spinner")
        s = misc.path_split(@filename)
        @path = s.head
        if @path == ''
            @path = './'
        @file = s.tail
        @last_page = 0
        @output    = @element.find(".webapp-editor-pdf-preview-output")
        @page      = @element.find(".webapp-editor-pdf-preview-page")
        @message   = @element.find(".webapp-editor-pdf-preview-message")
        @highlight = @element.find(".webapp-editor-pdf-preview-highlight").hide()
        @page.text('Loading preview...')
        @_output_scroll_top = 0 # used in conjunction with @output.scrollTop()
        @_first_output = true
        @_needs_update = true
        @_dragpos = null
        @_init_dragging()

    dbg: (mesg) =>
        #console.log("PDF_Preview: #{mesg}")

    # TODO refactor this into misc_page
    _init_dragging: =>
        reset = =>
            @page.css('cursor', '')
            @_dragpos = null

        @page.on 'mousedown', (e) =>
            e.preventDefault()
            # weird next line removes the focus from the codemirror textarea
            # otherwise, space-key and others have no effect on scrolling
            document.activeElement.blur()
            @_dragpos =
                left : e.clientX
                top  : e.clientY
            return false

        @page.on 'mouseup', (e) =>
            e.preventDefault()
            reset()
            return false

        {throttle} = require('underscore')
        mousemove_handler = (e) =>
            e.preventDefault()
            if not @_dragpos?
                return
            # this checks, if we come back into the viewport after leaving it
            # but the mouse is no longer pressed
            if e.which != 1
                reset()
                return
            @page.css('cursor', 'move')
            delta =
                left : e.clientX - @_dragpos.left
                top  : e.clientY - @_dragpos.top
            @output.scrollLeft(@output.scrollLeft() - delta.left)
            @output.scrollTop (@output.scrollTop()  - delta.top)
            @_dragpos =
                left : e.clientX
                top  : e.clientY
            return false
        @page.on 'mousemove', throttle(mousemove_handler, 20)

    zoom: (opts) =>
        opts = defaults opts,
            delta : undefined
            width : undefined

        images = @page.find("img")
        if images.length == 0
            return # nothing to do

        if opts.delta?
            if not @zoom_width?
                @zoom_width = 160   # NOTE: hardcoded also in editor.css class .webapp-editor-pdf-preview-image
            max_width = @zoom_width
            max_width += opts.delta
        else if opts.width?
            max_width = opts.width

        if max_width?
            @zoom_width = max_width
            n = @current_page().number
            max_width = "#{max_width}%"
            @page.find(".webapp-editor-pdf-preview-page-single").css
                'max-width'   : max_width
                width         : max_width
            @scroll_into_view(n : n, highlight_line:false, y:$(window).height()/2)

        @recenter()

    recenter: () =>
        container_width = @page.width()
        content_width = @page.find(':first-child:first').width()
        offset = (content_width - container_width)/2
        @page.parent().scrollLeft(offset)

    show_pages: (show) =>
        @page.toggle(show)
        @message.toggle(!show)

    show_message: (message_el) =>
        @show_pages(false)
        @message.empty()
        @message.append(message_el)

    watch_scroll: () =>
        if @_f?
            clearInterval(@_f)
        timeout = undefined
        @output.on 'scroll', () =>
            @_needs_update = true
        f = () =>
            return if not @element.is(':visible')
            @_output_scroll_top = @output.scrollTop()
            if @_needs_update
                @_needs_update = false
                @update cb:(err) =>
                    if err
                        @_needs_update = true
        @_f = setInterval(f, 1000)

    highlight_middle: (fade_time) =>
        if not fade_time?
            fade_time = 5000
        @highlight.show().offset(top:$(window).height()/2)
        @highlight.stop().animate(opacity:.3).fadeOut(fade_time)

    scroll_into_view: (opts) =>
        opts = defaults opts,
            n              : required   # page
            y              : 0          # y-coordinate on page
            highlight_line : true
        pg = @pdflatex.page(opts.n)
        elt = @element.find(".webapp-editor-pdf-preview-output")
        if not pg?.element? or not elt?
            # the page has vanished in the meantime...
            return
        t = elt.offset().top
        elt.scrollTop(0)  # reset to 0 first so that pg.element.offset().top is correct below
        top = (pg.element.offset().top + opts.y) - $(window).height() / 2
        elt.scrollTop(top)
        if opts.highlight_line
            # highlight location of interest
            @highlight_middle()

    remove: () =>
        if @_f?
            clearInterval(@_f)
        super()

    focus: () =>

    current_page: () =>
        tp = @element.offset().top
        for _page in @page.children()
            page = $(_page)
            offset = page.offset()
            if offset.top - tp > 0   # starts on the visible page
                n = page.data('number')
                if n > 1
                    n -= 1
                return {number:n, offset:offset.top}
        if page?
            return {number:page.data('number')}
        else
            return {number:1}

    update: (opts={}) =>
        opts = defaults opts,
            window_size : 4
            cb          : undefined

        if @_updating
            opts.cb?("already updating")  # don't change string
            return

        @dbg("update")
        #@spinner.show().spin(true)
        @_updating = true

        # Hide trailing pages.
        if @pdflatex.num_pages?
            @dbg("update: num_pages = #{@pdflatex.num_pages}")
            # This is O(N), but behaves better given the async nature...
            for p in @page.children()
                page = $(p)
                if page.data('number') > @pdflatex.num_pages
                    @dbg("update: removing page number #{page.data('number')}")
                    page.remove()

        n = @current_page().number
        @dbg("update: current_page=#{n}")

        f = (opts, cb) =>
            opts.cb = (err, changed_pages) =>
                if err
                    cb(err)
                else if changed_pages.length == 0
                    cb()
                else
                    g = (m, cb) =>
                        @_update_page(m, cb)
                    async.map(changed_pages, g, cb)
            @pdflatex.update_images(opts)

        hq_window = opts.window_size
        if n == 1
            hq_window *= 2

        f {first_page: n, last_page: n+1, resolution:@opts.resolution*3, device:'16m', png_downscale:3}, (err) =>
            if err
                #@spinner.spin(false).hide()
                @_updating = false
                opts.cb?(err)
            else if not @pdflatex.pdf_updated? or @pdflatex.pdf_updated
                @pdflatex.pdf_updated = false
                g = (obj, cb) =>
                    if obj[2]
                        f({first_page:obj[0], last_page:obj[1], resolution:'300', device:'16m', png_downscale:3}, cb)
                    else
                        f({first_page:obj[0], last_page:obj[1], resolution:'150', device:'gray', png_downscale:1}, cb)
                v = []
                v.push([n-hq_window, n-1, true])
                v.push([n+2, n+hq_window, true])

                k1 = Math.round((1 + n-hq_window-1)/2)
                v.push([1, k1])
                v.push([k1+1, n-hq_window-1])
                if @pdflatex.num_pages
                    k2 = Math.round((n+hq_window+1 + @pdflatex.num_pages)/2)
                    v.push([n+hq_window+1,k2])
                    v.push([k2,@pdflatex.num_pages])
                else
                    v.push([n+hq_window+1,999999])
                async.map v, g, (err) =>
                    #@spinner.spin(false).hide()
                    @_updating = false

                    # If first time, start watching for scroll movements to update.
                    if not @_f?
                        @watch_scroll()
                    opts.cb?()
            else
                @_updating = false
                opts.cb?()


    # update page n based on currently computed data.
    _update_page: (n, cb) =>
        p          = @pdflatex.page(n)
        url        = p.url
        resolution = p.resolution
        if not url?
            # delete page and all following it from DOM
            for m in [n .. @last_page]
                @page.remove(".webapp-editor-pdf-preview-page-#{m}")
            if @last_page >= n
                @last_page = n-1
        else
            @dbg("_update_page(#{n}) using #{url}")
            # update page
            recenter = (@last_page == 0)
            that = @
            page = @page.find(".webapp-editor-pdf-preview-page-#{n}")

            set_zoom_width = (page) =>
                if @zoom_width?
                    max_width = "#{@zoom_width}%"
                    page.css
                        'max-width'   : max_width
                        width         : max_width

            if page.length == 0
                # create
                for m in [@last_page+1 .. n]
                    page = $("<div class='webapp-editor-pdf-preview-page-single webapp-editor-pdf-preview-page-#{m}'>Page #{m}<br><img alt='Page #{m}' class='webapp-editor-pdf-preview-image'></div>")
                    page.data("number", m)

                    f = (e) ->
                        pg = $(e.delegateTarget)
                        n  = pg.data('number')
                        offset = $(e.target).offset()
                        x = e.pageX - offset.left
                        y = e.pageY - offset.top
                        img = pg.find("img")
                        nH = img[0].naturalHeight
                        nW = img[0].naturalWidth
                        y *= nH/img.height()
                        x *= nW/img.width()
                        that.emit 'shift-click', {n:n, x:x, y:y, resolution:img.data('resolution')}
                        return false

                    page.click (e) ->
                        if e.shiftKey or e.ctrlKey
                            f(e)
                        return false

                    page.dblclick(f)

                    set_zoom_width(page)

                    if @_first_output
                        @page.empty()
                        @_first_output = false

                    # Insert page in the right place in the output.  Since page creation
                    # can happen in parallel/random order (esp because of deletes of trailing pages),
                    # we have to work at this a bit.
                    done = false
                    for p in @page.children()
                        pg = $(p)
                        if pg.data('number') > m
                            page.insertBefore(pg)
                            done = true
                            break
                    if not done
                        @page.append(page)

                    @pdflatex.page(m).element = page

                @last_page = n
            # ~END: if page.length == 0

            img =  page.find("img")
            #console.log("setting an img src to", url)
            img.attr('src', url).data('resolution', resolution)
            load_error = () ->
                img.off('error', load_error)
                setTimeout((()->img.attr('src',url)), 2000)
            img.on('error', load_error)

            if recenter
                img.one 'load', () =>
                    @recenter()

            set_zoom_width(page)

            #page.find(".webapp-editor-pdf-preview-text").text(p.text)
        cb()

    show: =>
        @output.scrollTop(@_output_scroll_top)

    hide: =>
