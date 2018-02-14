# Shows the PDF file embedded

$ = window.$
async = require('async')
{defaults, required} = misc = require('smc-util/misc')
{webapp_client} = require('../webapp_client')
{FileEditor} = require('../editor')

templates = $("#webapp-editor-templates")

# NOTE: This is *ONLY* used as part of the latex editor now.  There is a rewrite
# in eidtor_pdf.cjsx in react that is much better.
class exports.PDF_PreviewEmbed extends FileEditor
    constructor: (project_id, filename, contents, opts) ->
        super(project_id, filename)
        @opts = opts
        @element = templates.find(".webapp-editor-pdf-preview-embed").clone()
        @pdf_title = @element.find(".webapp-editor-pdf-title")
        @pdf_title.find("span").text("loading ...")

        @spinner = @element.find(".webapp-editor-pdf-preview-embed-spinner")

        s = misc.path_split(@filename)
        @path = s.head
        if @path == ''
            @path = './'
        @file = s.tail

        @output = @element.find(".webapp-editor-pdf-preview-embed-page")

        @element.find('a[href="#refresh"]').click () =>
            @update()
            return false

        @update()

    update: (cb) =>
        button = @element.find('a[href="#refresh"]')
        button.icon_spin(true)

        @spinner.show().spin(true)
        webapp_client.read_file_from_project
            project_id : @project_id
            path       : @filename
            timeout    : 20
            cb         : (err, result) =>
                button.icon_spin(false)
                @spinner.spin(false).hide()
                if err or not result.url?
                    alert_message(type:"error", message:"unable to get pdf -- #{err}")
                else
                    @pdf_title.find("span").text(@filename)
                    @pdf_title.attr('target', '_blank').attr("href", result.url)
                    @output.find("iframe").attr('src', result.url)
                    @output.find("a").attr('href',"#{result.url}?random=#{Math.random()}")
                    @output.find("span").text(@filename)

    show: =>
        # Workaround Safari flex layout bug https://github.com/philipwalton/flexbugs/issues/132
        if $.browser.safari
            @element.find(".webapp-editor-pdf-preview-embed-page").make_height_defined()

    focus:=>

    hide: =>
