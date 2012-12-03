misc_page={}

(() ->
    misc_page.is_shift_enter = (e) -> e.which is 13 and e.shiftKey
    misc_page.is_enter       = (e) -> e.which is 13 and not e.shiftKey
    misc_page.is_ctrl_enter  = (e) -> e.which is 13 and e.ctrlKey
    misc_page.is_escape      = (e) -> e.which is 27


    # jQuery plugin for spinner (/spin/spin.min.js)
    $.fn.spin = (opts) ->
        @each ->
            $this = $(this)
            data = $this.data()
            if data.spinner
                data.spinner.stop()
                delete data.spinner
            if opts isnt false
                data.spinner = new Spinner($.extend({color: $this.css("color")}, opts)).spin(this)
        this

)()
