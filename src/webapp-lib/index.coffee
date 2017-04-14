update_stats = (stats) ->
    console.log stats

get_stats = ->
    r = new XMLHttpRequest()
    r.open("GET", "stats", true)
    r.onreadystatechange = ->
        return if r.readyState != 4 or r.status != 200
        try
            update_stats(JSON.parse(r.responseText))
        catch
    r.send()
    setTimeout(get_stats, 10 * 1000)

document.addEventListener "DOMContentLoaded", ->
    get_stats()
