{defaults, required} = require('smc-util/misc')

{DEFAULT_COMPUTE_IMAGE} = require('smc-util/db-schema')

COMPUTE_IMAGES =
    default: {title: "Default", descr: "Regularly updated, well tested."}
    stable: {title: "Stable", descr: "Slightly behind 'default', updated less frequently"}
    exp: {title: "Experimental", descr: "Cutting-edge software updates (could be broken)"}
    old: {title: "Old image", descr: "In use until Summer 2018. No longer maintained!"}

exports.get_compute_images = (opts) =>
    opts = defaults opts,
        cb   : required
    opts.cb(undefined, COMPUTE_IMAGES)

exports.is_valid = (name) =>
    return COMPUTE_IMAGES[name]?
