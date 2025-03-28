#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: MS-RSL – see LICENSE.md for details
#########################################################################

# Blobs

winston = require('./logger').getLogger('blobs')

misc_node = require('@cocalc/backend/misc_node')
misc    = require('@cocalc/util/misc')
{defaults, required} = misc
{MAX_BLOB_SIZE} = require('@cocalc/util/db-schema/blobs')

# save a blob in the blobstore database with given misc_node.uuidsha1 hash.
exports.save_blob = (opts) ->
    opts = defaults opts,
        uuid       : undefined  # uuid=sha1-based from blob; actually *required*, but instead of a traceback, get opts.cb(err)
        blob       : undefined  # actually *required*, but instead of a traceback, get opts.cb(err)
        ttl        : undefined  # object in blobstore will have *at least* this ttl in seconds;
                           # if there is already something, in blobstore with longer ttl, we leave it; undefined = infinite ttl
        check      : true       # if true, return an error (via cb) if misc_node.uuidsha1(opts.blob) != opts.uuid.
                           # This is a check against bad user-supplied data.
        project_id : undefined
        account_id : undefined
        database   : required
        cb         : required   # cb(err, ttl actually used in seconds); ttl=0 for infinite ttl

    dbg = (m) -> winston.debug("save_blob(uuid=#{opts.uuid}): #{m}")
    dbg()

    err = undefined

    if not opts.blob?
        err = "save_blob: UG -- error in call to save_blob (uuid=#{opts.uuid}); received a save_blob request with undefined blob"

    else if not opts.uuid?
        err = "save_blob: BUG -- error in call to save_blob; received a save_blob request without corresponding uuid"

    else if not opts.project_id?
        err = "save_blob: BUG -- error in call to save_blob; received a save_blob request without corresponding project_id"

    else if opts.blob.length > MAX_BLOB_SIZE
        err = "save_blob: blobs are limited to #{misc.human_readable_size(MAX_BLOB_SIZE)} and you just tried to save one of size #{opts.blob.length/1000000}MB"

    else if opts.check and opts.uuid != misc_node.uuidsha1(opts.blob)
        err = "save_blob: uuid=#{opts.uuid} must be derived from the Sha1 hash of blob, but it is not (possible malicious attack)"

    if err
        dbg(err)
        opts.cb(err)
        return

    # Store the blob in the database, if it isn't there already.
    opts.database.save_blob
        uuid       : opts.uuid
        blob       : opts.blob
        ttl        : opts.ttl
        project_id : opts.project_id
        account_id : opts.account_id
        cb         : (err, ttl) =>
            if err
                dbg("failed to store blob -- #{err}")
            else
                dbg("successfully stored blob")
            opts.cb(err, ttl)
