###
Additional mathjax utilities (in coffeescript).
###

{remove_math, replace_math} = require('./mathjax-utils')
{is_array} = require('./misc')

# string -- a string
# v -- either a single function or an array of functions
# First strips out math, applies all the functions, then puts the math back.
exports.apply_without_math = (string, v) ->
    if not is_array(v)
        v = [v]
    [string, math] = remove_math(string, true)  # true so doesn't mess with &, etc.
    for f in v
        string = f(string)
    return replace_math(string, math);
