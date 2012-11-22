###
# coffee -w -c index.coffee
### 

$(() ->
    $(".input").focus()

    
    $(".input").keydown (e) ->
        if e.which is 13 and e.shiftKey
            input = $(this).text()
            console.log(input)
            $(".output").text(eval(input))
            return false
)
