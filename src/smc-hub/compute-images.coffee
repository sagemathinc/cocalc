{defaults, required} = require('smc-util/misc')

# better make sure the storage server has something available under "default"
exports.DEFAULT_COMPUTE_IMAGE = 'default'

COMPUTE_IMAGES =
    default: {title: "Default", descr: "Default Ubuntu 18.04 based image, updated regularly"}
    stable: {title: "Stable", descr: "Slightly behind 'default', updated less frequently"}
    exp: {title: "Experimental", descr: "Get cutting-edge software updates (which could be broken)"}
    old: {title: "Old image", descr: "Ubuntu 16.04 based software, used up until Summer 2018 – no longer maintained!"}

exports.get_compute_images = (opts) =>
    opts = defaults opts,
        cb   : required
    opts.cb(undefined, COMPUTE_IMAGES)

exports.is_valid = (name) =>
    return COMPUTE_IMAGES[name]?
