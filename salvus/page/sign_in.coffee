$('#well-create_account').hide()
$('#sign_in-email').focus()

$("a[href='#well-create_account']").click (event) ->
    $('#well-create_account').show()
    $('#well-sign_in').hide()
    $('#create_account-first-name').focus()

$("a[href='#well-sign_in']").click (event) ->
    $('#well-create_account').hide()
    $('#well-sign_in').show()
    $('#sign_in-email').focus()

