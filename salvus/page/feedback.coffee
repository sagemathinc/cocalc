(() ->

    $("#feedback-nps-slider").slider
        min     : 1
        max     : 10
        value   : 0
        step    : 1
        animate : "fast"
        slide  : (event, ui) ->
            $("#feedback-nps-slider-value").html(ui.value)
    
)()    