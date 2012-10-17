# Echo server library

sockjs = new SockJS '/echo'
$('#first input').focus()

div = $('#first div')
inp = $('#first input')
form = $('#first form')

print = (m, p) ->
    if p == undefined
        p = ""
    else
        p = JSON.stringify(p)
    div.append $("<code>").text("#{m} #{p}")
    div.append $("<br>")
    div.scrollTop (div.scrollTop() + 10000)

sockjs.onopen    =     -> print '[*] open', sockjs.protocol
sockjs.onmessage = (e) -> print '[.] message', e.data
sockjs.onclose   =     -> print '[*] close'

form.submit( ->
    print '[ ] sending', inp.val()
    sockjs.send inp.val()
    inp.val('')
    return false)
