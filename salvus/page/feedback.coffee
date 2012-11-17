(() ->

    reset_feedback_form = () ->
        $("#feedback-nps-slider-value").html(0)
        $("#feedback-nps-slider").slider("value", 0)
        $("#feedback-category").val('bug')
        $("#feedback-description").val('')

    $("#feedback-nps-slider").slider
        min     : 1
        max     : 10
        value   : 0
        step    : 1
        animate : "fast"
        slide  : (event, ui) ->
            $("#feedback-nps-slider-value").html(ui.value)

    $("a[href='#submit_feedback']").click (event) ->
        cat = if $("#feedback-category-bug").is(":checked") then "bug" else "idea"
        salvus.conn.report_feedback
            category    : cat
            description : $("#feedback-description").val()
            nps         : $("#feedback-nps-slider-value").html()
            cb          : (error, mesg) ->
                if error
                    alert_message(type:"error", message: "There was an error submitting feedback ('#{error}').")
                    return
                if mesg.event == 'feedback_reported'
                    alert_message(type:"info", message: "Salvus has recorded your #{cat}, and a developer will look at it soon.  Thank you!")
                    reset_feedback_form()
                else
                    alert_message(type:"error", message: "Feedback reported, but return message was wrong #{JSON.stringify(mesg)}")
            
        return false

    
    controller.on "show_page_feedback", (() -> $("#feedback-description").focus())
    
)()    