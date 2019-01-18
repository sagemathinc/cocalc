{defaults, required} = require('smc-util/misc')

{DEFAULT_COMPUTE_IMAGE} = require('smc-util/db-schema')

exports.DEFAULT_COMPUTE_IMAGE = DEFAULT_COMPUTE_IMAGE

exports.COMPUTE_IMAGES = COMPUTE_IMAGES =
    default: {title: "Default", descr: "Regularly updated, well tested."}
    previous: {title: "Previous", descr: "One or two weeks behind 'default'"}
    "stable-2018-08-27" : {title: "2018-08-27", descr: "Frozen at 2018-08-27 and no longer updated"}
    "stable-2019-01-12" : {title: "2019-01-12", descr: "Frozen at 2019-01-12 and no longer updated"}
    exp: {title: "Experimental", descr: "Cutting-edge software updates (could be broken)"}
    old: {title: "Old image", descr: "In use until Summer 2018. No longer maintained!"}

exports.get_compute_images = (opts) =>
    opts = defaults opts,
        cb   : required
    opts.cb(undefined, COMPUTE_IMAGES)

exports.is_valid = (name) =>
    return COMPUTE_IMAGES[name]?
