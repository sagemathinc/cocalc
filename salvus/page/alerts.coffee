(() ->

    $("#alert-communications-error").hide()

)()

communications_error = () ->
    $("#alert-communications-error").clone().attr("id","").prependTo("#container-alerts").show()

