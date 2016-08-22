###
Coffeescript functions that are useful in containers.

This file gets copied into the image build directory when building the docker image.
###

# If g = retry_wrapper(f, 'foo'), then
#  g('a', 'b', 'c')
# will call f('a','b','c', cb) repeatedly (with exponetial backoff)
# until success, with success meaning that cb is
# called with false first arg.
exports.retry_wrapper = (f, name) ->
    delays = {}
    (args...) ->
        key = JSON.stringify(args)
        if delays[key]? then return else delays[key] = 3000
        args.push (err) ->
            if err
                delays[key] = Math.min(1.3*delays[key], 20000)
                console.log("ERROR #{name} (wait #{delays[key]}ms)", args.slice(0,args.length-1), " --", err)
                setTimeout((()->f(args...)), delays[key])
            else
                delete delays[key]
        f(args...)
        return
