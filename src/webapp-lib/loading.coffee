# js for loading.html

state =
    target    : ''
    timeout   : 1
    retry     : 0

update_history = ->
    title = document.getElementsByTagName('title')[0]?.innerHTML ? state.target
    window.history.pushState({}, title, state.target)

load_target = ->
    r = new XMLHttpRequest()
    r.open("GET", state.target, true)
    r.onreadystatechange = ->
        if r.readyState == XMLHttpRequest.DONE
            if r.status >= 500 and r.status < 600
                # problem
                status()
                setTimeout(load_target, 2 * 1000)
            if r.status == 200
                # success
                print('')
                document.open()
                document.write(r.responseText)
                document.close()
                setTimeout(update_history, 1)
    try
        r.send()
    catch e
        console.log("Exception in r.send:", e)

status = ->
    status.retry += 1
    dots = ('.' for i in [0...state.retry]).join('')
    msg  = "<b>Loading <code>#{state.target}</code>..#{dots}</b>"
    print(msg)

print = (html) ->
    # note, upon loading the element could be gone and empty
    document.getElementById('status')?.innerHTML = html

window.onload = ->
    # http://domain.name/base_url/static/loading.html?target=[encoded-url]&timeout=[int]
    data = window.location.search.slice(1)
    for token in data.split('&')
        [k, v] = token.split('=')
        continue if (not k?) or (not v?)
        value = decodeURIComponent(v)
        if k == 'timeout'
            try
                value = parseInt(value)
            catch
                console.warn("Value of #{k} cannot be parsed:", value)
                continue
        state["#{k}"] = value
    if state.target.length == 0
        print('STOP: Nothing to load.')
    else
        status()
        load_target()
