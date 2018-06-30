###
Evaluate a line of code with the scope containing only a jquery wrapped
element and whatever is available on window.  Obviously not "safe", but
maybe safer/cleaner than nothing.
###
require = requirejs = ->
    console.warn("require is not available in CoCalc; if you need a Javascript library, please request it.")
exports.javascript_eval = (line, element) ->
    try
        eval(line)
    catch err
        console.warn("Jupyter Eval Error: #{err}")
