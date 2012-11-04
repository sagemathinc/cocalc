############################################
# Account management
############################################

sign_out = ->
    $.getJSON("/tornado/auth/logout", ->
        $("#username").hide()
        $("#sign_out").hide()
        $("#sign_in").show()
    )

sign_in = (username) ->
    $("#sign_in").hide()
    $("#username").show().html(username)
    $("#sign_out").show()

$("#sign_in").button().click ->
$("#sign_out").button().hide().click(sign_out)

