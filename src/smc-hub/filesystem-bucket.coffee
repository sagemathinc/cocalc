#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Filesystem based bucket -- same api as gcloud bucket.

Motivation: in KuCalc we use gcsfuse to just mount the smc-blobs bucket
defined in smc-gcloud.
###

fs = require('fs')

{defaults} = misc = require('smc-util/misc')
required = defaults.required

exports.filesystem_bucket = (opts) ->
    opts = defaults opts,
        name : required
    if not opts.name
        throw Error("bucket name must be specified")
    return new FilesystemBucket(opts.name)

class FilesystemBucket
    constructor: (@path) ->

    blob_path: (name) =>
        return "#{@path}/#{name}"

    write: (opts) =>
        opts = defaults opts,
            name    : required
            content : required
            cb      : required
        fs.writeFile(@blob_path(opts.name), opts.content, opts.cb)


    read: (opts) =>
        opts = defaults opts,
            name    : required
            cb      : required
        fs.readFile(@blob_path(opts.name), opts.cb)

    delete: (opts) =>
        opts = defaults opts,
            name    : required
            cb      : undefined
        fs.unlink(@blob_path(opts.name), (err)->opts.cb?(err))