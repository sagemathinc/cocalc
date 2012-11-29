(() ->
    console.log("FOO!")
    page = $("#worksheet-cm")
    templates = $(".worksheet-cm-templates")
    e = templates.find(".worksheet-cm").clone().show().appendTo(page).find("textarea")[0]
    console.log(e)
    editor = CodeMirror.fromTextArea(e, lineNumbers: false)
)()

