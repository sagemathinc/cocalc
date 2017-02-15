###
PostgreSQL -- implementation of queries needed for storage and managing blobs,
including backups, integration with google cloud storage, etc.

COPYRIGHT : (c) 2017 SageMath, Inc.
LICENSE   : AGPLv3
###

# Bucket used for cheaper longterm storage of blobs (outside of PostgreSQL).
# NOTE: We should add this to site configuration, and have it get read once when first
# needed and cached.  Also it would be editable in admin account settings.
BLOB_GCLOUD_BUCKET = 'smc-blobs'

async   = require('async')
snappy  = require('snappy')
zlib    = require('zlib')
fs      = require('fs')

misc_node = require('smc-util-node/misc_node')

{defaults} = misc = require('smc-util/misc')
required = defaults.required

{expire_time, one_result, all_results, PostgreSQL} = require('./postgres')

class exports.PostgreSQL extends PostgreSQL
    save_blob: (opts) =>
        opts = defaults opts,
            uuid       : undefined # uuid=sha1-based id coming from blob
            blob       : required  # unless check=true, we assume misc_node.uuidsha1(opts.blob) == opts.uuid;
                                   # blob must be a string or Buffer
            ttl        : 0         # object in blobstore will have *at least* this ttl in seconds;
                                   # if there is already something in blobstore with longer ttl, we leave it;
                                   # infinite ttl = 0.
            project_id : required  # the id of the project that is saving the blob
            check      : false     # if true, will give error if misc_node.uuidsha1(opts.blob) != opts.uuid
            compress   : undefined # optional compression to use: 'gzip', 'zlib', 'snappy'; only used if blob not already in db.
            level      : -1        # compression level (if compressed) -- see https://github.com/expressjs/compression#level
            cb         : required  # cb(err, ttl actually used in seconds); ttl=0 for infinite ttl
        if not Buffer.isBuffer(opts.blob)
            # CRITICAL: We assume everywhere below that opts.blob is a
            # buffer, e.g., in the .toString('hex') method!
            opts.blob = new Buffer(opts.blob)
        if not opts.uuid?
            opts.uuid = misc_node.uuidsha1(opts.blob)
        else if opts.check
            uuid = misc_node.uuidsha1(opts.blob)
            if uuid != opts.uuid
                opts.cb("the sha1 uuid (='#{uuid}') of the blob must equal the given uuid (='#{opts.uuid}')")
                return
        if not misc.is_valid_uuid_string(opts.uuid)
            opts.cb("uuid is invalid")
            return
        dbg = @_dbg("save_blob(uuid='#{opts.uuid}')")
        dbg()
        rows = ttl = undefined
        async.series([
            (cb) =>
                @_query
                    query : 'SELECT expire FROM blobs'
                    where : "id = $::UUID" : opts.uuid
                    cb    : (err, x) =>
                        rows = x.rows; cb(err)
            (cb) =>
                if rows.length == 0 and opts.compress
                    dbg("compression requested and blob not already saved, so we compress blob")
                    switch opts.compress
                        when 'gzip'
                            zlib.gzip opts.blob, {level:opts.level}, (err, blob) =>
                                opts.blob = blob; cb(err)
                        when 'zlib'
                            zlib.deflate opts.blob, {level:opts.level}, (err, blob) =>
                                opts.blob = blob; cb(err)
                        when 'snappy'
                            snappy.compress opts.blob, (err, blob) =>
                                opts.blob = blob; cb(err)
                        else
                            cb("compression format '#{opts.compress}' not implemented")
                else
                    cb()
            (cb) =>
                if rows.length == 0
                    dbg("nothing in DB, so we insert the blob.")
                    ttl = opts.ttl
                    @_query
                        query  : "INSERT INTO blobs"
                        values :
                            id         : opts.uuid
                            blob       : '\\x'+opts.blob.toString('hex')
                            project_id : opts.project_id
                            count      : 0
                            size       : opts.blob.length
                            created    : new Date()
                            compress   : opts.compress
                            expire     : if ttl then expire_time(ttl)
                        cb     : cb
                else
                    dbg("blob already in the DB, so see if we need to change the expire time")
                    @_extend_blob_ttl
                        expire : rows[0].expire
                        ttl    : opts.ttl
                        uuid   : opts.uuid
                        cb     : (err, _ttl) =>
                            ttl = _ttl; cb(err)
        ], (err) => opts.cb(err, ttl))

    # Used internally by save_blob to possibly extend the expire time of a blob.
    _extend_blob_ttl : (opts) =>
        opts = defaults opts,
            expire : undefined    # what expire is currently set to in the database
            ttl    : required     # requested ttl -- extend expire to at least this
            uuid   : required
            cb     : required     # (err, effective ttl (with 0=oo))
        if not misc.is_valid_uuid_string(opts.uuid)
            opts.cb("uuid is invalid")
            return
        if not opts.expire
            # ttl already infinite -- nothing to do
            opts.cb(undefined, 0)
            return
        new_expire = ttl = undefined
        if opts.ttl
            # saved ttl is finite as is requested one; change in DB if requested is longer
            z = expire_time(opts.ttl)
            if z > opts.expire
                new_expire = z
                ttl = opts.ttl
            else
                ttl = (opts.expire - new Date())/1000.0
        else
            # saved ttl is finite but requested one is infinite
            ttl = new_expire = 0
        if new_expire?
            # change the expire time for the blob already in the DB
            @_query
                query : 'UPDATE blobs'
                where : "id = $::UUID" : opts.uuid
                set   : "expire :: TIMESTAMP " : if new_expire == 0 then undefined else new_expire
                cb    : (err) => opts.cb(err, ttl)
        else
            opts.cb(undefined, ttl)

    get_blob: (opts) =>
        opts = defaults opts,
            uuid       : required
            save_in_db : false  # if true and blob isn't in DB and is only in gcloud, copies to local DB
                                # (for faster access e.g., 20ms versus 5ms -- i.e., not much faster; gcloud is FAST too.)
            touch      : true
            cb         : required   # cb(err) or cb(undefined, blob_value) or cb(undefined, undefined) in case no such blob
        if not misc.is_valid_uuid_string(opts.uuid)
            opts.cb("uuid is invalid")
            return
        x    = undefined
        blob = undefined
        async.series([
            (cb) =>
                @_query
                    query : "SELECT expire, blob, gcloud, compress FROM blobs"
                    where : "id = $::UUID" : opts.uuid
                    cb    : one_result (err, _x) =>
                        x = _x; cb(err)
            (cb) =>
                if not x?
                    # nothing to do -- blob not in db (probably expired)
                    cb()
                else if x.expire and x.expire <= new Date()
                    # the blob already expired -- background delete it
                    @_query   # delete it (but don't wait for this to finish)
                        query : "DELETE FROM blobs"
                        where : "id = $::UUID" : opts.uuid
                    cb()
                else if x.blob?
                    # blob not expired and is in database
                    blob = x.blob
                    cb()
                else if x.gcloud
                    # blob not available locally, but should be in a Google cloud storage bucket -- try to get it
                    @gcloud().bucket(name: x.gcloud).read
                        name : opts.uuid
                        cb   : (err, _blob) =>
                            if err
                                cb(err)
                            else
                                blob = _blob
                                cb()
                                if opts.save_in_db
                                    # also save in database so will be faster next time (again, don't wait on this)
                                    @_query   # delete it (but don't wait for this to finish)
                                        query : "UPDATE blobs"
                                        set   : {blob : blob}
                                        where : "id = $::UUID" : opts.uuid
                else
                    # blob not local and not in gcloud -- this shouldn't happen (just view this as "expired" by not setting blob)
                    cb()
            (cb) =>
                if not blob? or not x?.compress?
                    cb(); return
                # blob is compressed -- decompress it
                switch x.compress
                    when 'gzip'
                        zlib.gunzip blob, (err, _blob) =>
                            blob = _blob; cb(err)
                    when 'zlib'
                        zlib.inflate blob, (err, _blob) =>
                            blob = _blob; cb(err)
                    when 'snappy'
                        snappy.uncompress blob, (err, _blob) =>
                            blob = _blob; cb(err)
                    else
                        cb("compression format '#{x.compress}' not implemented")
        ], (err) =>
            opts.cb(err, blob)
            if blob? and opts.touch
                # blob was pulled from db or gcloud, so note that it was accessed (updates a counter)
                @touch_blob(uuid : opts.uuid)
        )

    touch_blob: (opts) =>
        opts = defaults opts,
            uuid : required
            cb   : undefined
        if not misc.is_valid_uuid_string(opts.uuid)
            opts.cb?("uuid is invalid")
            return
        @_query
            query : "UPDATE blobs SET count = count + 1, last_active = NOW()"
            where : "id = $::UUID" : opts.uuid
            cb    : opts.cb

    # Return gcloud API interface
    gcloud: () =>
        return @_gcloud ?= require('./smc_gcloud').gcloud()

    # Uploads the blob with given sha1 uuid to gcloud storage, if it hasn't already
    # been uploaded there.
    copy_blob_to_gcloud: (opts) =>
        opts = defaults opts,
            uuid   : required  # uuid=sha1-based uuid coming from blob
            bucket : BLOB_GCLOUD_BUCKET # name of bucket
            force  : false      # if true, upload even if already uploaded
            remove : false      # if true, deletes blob from database after successful upload to gcloud (to free space)
            cb     : undefined  # cb(err)
        if not misc.is_valid_uuid_string(opts.uuid)
            opts.cb?("uuid is invalid")
            return
        x = undefined
        async.series([
            (cb) =>
                @_query
                    query : "SELECT blob, gcloud FROM blobs"
                    where : "id = $::UUID" : opts.uuid
                    cb    : one_result (err, _x) =>
                        x = _x
                        if err
                            cb(err)
                        else if not x?
                            cb('no such blob')
                        else if not x.blob and not x.gcloud
                            cb('blob not available -- this should not be possible')
                        else if not x.blob and opts.force
                            cb("blob can't be re-uploaded since it was already deleted")
                        else
                            cb()
            (cb) =>
                if x.gcloud? and not opts.force
                    # already uploaded -- don't need to do anything
                    cb(); return
                if not x.blob?
                    # blob already deleted locally
                    cb(); return
                # upload to Google cloud storage
                @gcloud().bucket(name:opts.bucket).write
                    name    : opts.uuid
                    content : x.blob
                    cb      : cb
            (cb) =>
                if not x.blob?
                    # no blob in db; nothing further to do.
                    cb()
                else
                    # We successful upload to gcloud -- set x.gcloud
                    set = {gcloud: opts.bucket}
                    if opts.remove
                        set.blob = null   # remove blob content from database to save space
                    @_query
                        query : "UPDATE blobs"
                        where : "id = $::UUID" : opts.uuid
                        set   : set
                        cb    : cb
        ], (err) => opts.cb?(err))

    ###
    Backup limit blobs that previously haven't been dumped to blobs, and put them in
    a tarball in the given path.  The tarball's name is the time when the backup starts.
    The tarball is compressed using gzip compression.

       db._error_thresh=1e6; db.backup_blobs_to_tarball(limit:10000,path:'/backup/tmp-blobs',repeat_until_done:60, cb:done())

    I have not written code to restore from these tarballs.  Assuming the database has been restored,
    so there is an entry in the blobs table for each blob, it would suffice to upload the tarballs,
    then copy their contents straight into the BLOB_GCLOUD_BUCKET gcloud bucket, and that’s it.
    If we don't have the blobs table in the DB, make dummy entries from the blob names in the tarballs.
    ###
    backup_blobs_to_tarball: (opts) =>
        opts = defaults opts,
            limit             : 10000    # number of blobs to backup
            path              : required # path where [timestamp].tar file is placed
            throttle          : 0        # wait this many seconds between pulling blobs from database
            repeat_until_done : 0        # if positive, keeps re-call'ing this function until no more
                                         # results to backup (pauses this many seconds between)
            map_limit         : 5
            cb                : undefined# cb(err, '[timestamp].tar')
        dbg     = @_dbg("backup_blobs_to_tarball(limit=#{opts.limit},path='#{opts.path}')")
        join    = require('path').join
        dir     = misc.date_to_snapshot_format(new Date())
        target  = join(opts.path, dir)
        tarball = target + '.tar.gz'
        v       = undefined
        to_remove = []
        async.series([
            (cb) =>
                dbg("make target='#{target}'")
                fs.mkdir(target, cb)
            (cb) =>
                dbg("get blobs that we need to back up")
                @_query
                    query : "SELECT id FROM blobs"
                    where : "expire IS NULL and backup IS NOT true"
                    limit : opts.limit
                    cb    : all_results 'id', (err, x) =>
                        v = x; cb(err)
            (cb) =>
                dbg("backing up #{v.length} blobs")
                f = (id, cb) =>
                    @get_blob
                        uuid  : id
                        touch : false
                        cb    : (err, blob) =>
                            if err
                                dbg("ERROR! blob #{id} -- #{err}")
                                cb(err)
                            else if blob?
                                dbg("got blob #{id} from db -- now write to disk")
                                to_remove.push(id)
                                fs.writeFile join(target, id), blob, (err) =>
                                    if opts.throttle
                                        setTimeout(cb, opts.throttle*1000)
                                    else
                                        cb()
                            else
                                dbg("blob #{id} is expired, so nothing to be done, ever.")
                                cb()
                async.mapLimit(v, opts.map_limit, f, cb)
            (cb) =>
                dbg("successfully wrote all blobs to files; now make tarball")
                misc_node.execute_code
                    command : 'tar'
                    args    : ['zcvf', tarball, dir]
                    path    : opts.path
                    timeout : 3600
                    cb      : cb
            (cb) =>
                dbg("remove temporary blobs")
                f = (x, cb) =>
                    fs.unlink(join(target, x), cb)
                async.mapLimit(to_remove, 10, f, cb)
            (cb) =>
                dbg("remove temporary directory")
                fs.rmdir(target, cb)
            (cb) =>
                dbg("backup succeeded completely -- mark all blobs as backed up")
                @_query
                    query : "UPDATE blobs"
                    set   : {backup: true}
                    where : "id = ANY($)" : v
                    cb    : cb
        ], (err) =>
            if err
                dbg("ERROR: #{err}")
                opts.cb?(err)
            else
                dbg("done")
                if opts.repeat_until_done and to_remove.length == opts.limit
                    f = () =>
                        @backup_blobs_to_tarball(opts)
                    setTimeout(f, opts.repeat_until_done*1000)
                else
                    opts.cb?(undefined, tarball)
        )

    ###
    Copied all blobs that will never expire to a google cloud storage bucket.

        errors={}; db.copy_all_blobs_to_gcloud(limit:500, cb:done(), remove:true, repeat_until_done_s:10, errors:errors)
    ###
    copy_all_blobs_to_gcloud: (opts) =>
        opts = defaults opts,
            bucket    : BLOB_GCLOUD_BUCKET # name of bucket
            limit     : 1000               # copy this many in each batch
            map_limit : 1                  # copy this many at once.
            throttle  : 0                  # wait this many seconds between uploads
            repeat_until_done_s : 0        # if nonzero, waits this many seconds, then calls this function again until nothing gets uploaded.
            errors    : {}                 # used to accumulate errors
            remove    : false
            cb        : required
        dbg = @_dbg("copy_all_blobs_to_gcloud")
        dbg()
        # This query selects the blobs that will never expire, but have not yet
        # been copied to Google cloud storage.
        dbg("getting blob id's...")
        @_query
            query : 'SELECT id, size FROM blobs'
            where : "expire IS NULL AND gcloud IS NULL"
            limit : opts.limit
            cb    : all_results (err, v) =>
                if err
                    dbg("fail: #{err}")
                    opts.cb(err)
                else
                    n = v.length; m = 0
                    dbg("got #{n} blob id's")
                    f = (x, cb) =>
                        m += 1
                        k = m; start = new Date()
                        dbg("**** #{k}/#{n}: uploading #{x.id} of size #{x.size/1000}KB")
                        @copy_blob_to_gcloud
                            uuid   : x.id
                            bucket : opts.bucket
                            remove : opts.remove
                            cb     : (err) =>
                                dbg("**** #{k}/#{n}: finished -- #{err}; size #{x.size/1000}KB; time=#{new Date() - start}ms")
                                if err
                                    opts.errors[x.id] = err
                                if opts.throttle
                                    setTimeout(cb, 1000*opts.throttle)
                                else
                                    cb()
                    async.mapLimit v, opts.map_limit, f, (err) =>
                        dbg("finished this round -- #{err}")
                        if opts.repeat_until_done_s and v.length > 0
                            dbg("repeat_until_done triggering another round")
                            setTimeout((=> @copy_all_blobs_to_gcloud(opts)), opts.repeat_until_done_s*1000)
                        else
                            dbg("done : #{misc.to_json(opts.errors)}")
                            opts.cb(if misc.len(opts.errors) > 0 then opts.errors)

    blob_maintenance: (opts) =>
        opts = defaults opts,
            path              : '/backup/blobs'
            map_limit         : 1
            blobs_per_tarball : 10000
            throttle          : 0
            cb                : undefined
        dbg = @_dbg("blob_maintenance()")
        dbg()
        async.series([
            (cb) =>
                dbg("maintain the patches and syncstrings")
                @syncstring_maintenance
                    repeat_until_done : true
                    limit             : 500
                    map_limit         : opts.map_limit
                    delay             : 1000    # 1s, since syncstring_maintence heavily loads db
                    cb                : cb
            (cb) =>
                dbg("backup_blobs_to_tarball")
                @backup_blobs_to_tarball
                    throttle          : opts.throttle
                    limit             : opts.blobs_per_tarball
                    path              : opts.path
                    map_limit         : opts.map_limit
                    repeat_until_done : 5
                    cb                : cb
            (cb) =>
                dbg("copy_all_blobs_to_gcloud")
                errors = {}
                @copy_all_blobs_to_gcloud
                    limit               : 1000
                    repeat_until_done_s : 5
                    errors              : errors
                    remove              : true
                    map_limit           : opts.map_limit
                    throttle            : opts.throttle
                    cb                  : (err) =>
                        if misc.len(errors) > 0
                            dbg("errors! #{misc.to_json(errors)}")
                        cb(err)
        ], (err) =>
            opts.cb?(err)
        )

    remove_blob_ttls: (opts) =>
        opts = defaults opts,
            uuids : required   # uuid=sha1-based from blob
            cb    : required   # cb(err)
        @_query
            query : "UPDATE blobs"
            set   : {expire: null}
            where : "id::UUID = ANY($)" : (x for x in opts.uuids when misc.is_valid_uuid_string(x))
            cb    : opts.cb

    # If blob has been copied to gcloud, remove the BLOB part of the data
    # from the database (to save space).  If not copied, copy it to gcloud,
    # then remove from database.
    close_blob: (opts) =>
        opts = defaults opts,
            uuid   : required   # uuid=sha1-based from blob
            bucket : BLOB_GCLOUD_BUCKET # name of bucket
            cb     : undefined   # cb(err)
        if not misc.is_valid_uuid_string(opts.uuid)
            opts.cb?("uuid is invalid")
            return
        async.series([
            (cb) =>
                # ensure blob is in gcloud
                @_query
                    query : 'SELECT gcloud FROM blobs'
                    where : 'id = $::UUID' : opts.uuid
                    cb    : one_result 'gcloud', (err, gcloud) =>
                        if err
                            cb(err)
                        else if not gcloud
                            # not yet copied to gcloud storage
                            @copy_blob_to_gcloud
                                uuid   : opts.uuid
                                bucket : opts.bucket
                                cb     : cb
                        else
                            # copied already
                            cb()
            (cb) =>
                # now blob is in gcloud -- delete blob data in database
                @_query
                    query : 'SELECT gcloud FROM blobs'
                    where : 'id = $::UUID' : opts.uuid
                    set   : {blob: null}
                    cb    : cb
        ], (err) => opts.cb?(err))



    ###
    # Syncstring maintainence
    ###
    syncstring_maintenance: (opts) =>
        opts = defaults opts,
            age_days          : 30    # archive patches of syncstrings that are inactive for at least this long
            map_limit         : 1     # how much parallelism to use
            limit             : 1000 # do only this many
            repeat_until_done : true
            delay             : 0
            cb                : undefined
        dbg = @_dbg("syncstring_maintenance")
        dbg(opts)
        syncstrings = undefined
        async.series([
            (cb) =>
                dbg("determine inactive syncstring ids")
                @_query
                    query : 'SELECT string_id FROM syncstrings'
                    where : [{'last_active <= $::TIMESTAMP' : misc.days_ago(opts.age_days)}, 'archived IS NULL']
                    limit : opts.limit
                    cb    : all_results 'string_id', (err, v) =>
                        syncstrings = v
                        cb(err)
            (cb) =>
                dbg("archive patches for inactive syncstrings")
                i = 0
                f = (string_id, cb) =>
                    i += 1
                    console.log("*** #{i}/#{syncstrings.length}: archiving string #{string_id} ***")
                    @archive_patches
                        string_id : string_id
                        cb        : (err) ->
                           if err or not opts.delay
                               cb(err)
                           else
                               setTimeout(cb, opts.delay)
                async.mapLimit(syncstrings, opts.map_limit, f, cb)
        ], (err) =>
            if err
                opts.cb?(err)
            else if opts.repeat_until_done and syncstrings.length == opts.limit
                dbg("doing it again")
                @syncstring_maintenance(opts)
            else
                opts.cb?()
        )

    # Offlines and archives the patch, unless the string is active very recently, in
    # which case this is a no-op.
    archive_patches: (opts) =>
        opts = defaults opts,
            string_id : required
            compress  : 'zlib'
            level     : -1   # the default
            cb        : undefined
        dbg = @_dbg("archive_patches(string_id='#{opts.string_id}')")
        syncstring = patches = blob_uuid = project_id = last_active =undefined
        cutoff = misc.minutes_ago(30)
        where = {"string_id = $::CHAR(40)" : opts.string_id}
        async.series([
            (cb) =>
                dbg("get project_id")
                @_query
                    query : "SELECT project_id, archived, last_active FROM syncstrings"
                    where : where
                    cb    : one_result (err, x) =>
                        if err
                            cb(err)
                        else if not x?
                            cb("no such syncstring with id '#{opts.string_id}'")
                        else if x.archived
                            cb("already archived")
                        else
                            project_id = x.project_id
                            last_active = x.last_active
                            cb()
            (cb) =>
                if last_active? and last_active >= cutoff
                    cb(); return
                dbg("get patches")
                @_query
                    query : "SELECT extract(epoch from time) as epoch, * FROM patches"
                    where : where
                    cb    : all_results (err, x) =>
                        patches = x
                        for p in patches
                            p.time = new Date(p.epoch*1000)
                            delete p.epoch
                        cb(err)
            (cb) =>
                if last_active? and last_active >= cutoff
                    cb(); return
                dbg("create blob from patches")
                try
                    blob = new Buffer(JSON.stringify(patches))
                catch err
                    # TODO: This *will* happen if the total length of all patches is too big.
                    cb(err)
                    return
                dbg('save blob')
                blob_uuid = misc_node.uuidsha1(blob)
                @save_blob
                    uuid       : blob_uuid
                    blob       : blob
                    project_id : project_id
                    compress   : opts.compress
                    level      : opts.level
                    cb         : cb
            (cb) =>
                if last_active? and last_active >= cutoff
                    cb(); return
                dbg("update syncstring to indicate patches have been archived in a blob")
                @_query
                    query : "UPDATE syncstrings"
                    set   : {archived : blob_uuid}
                    where : where
                    cb    : cb
            (cb) =>
                if last_active? and last_active >= cutoff
                    cb(); return
                dbg("actually delete patches")
                @_query
                    query : "DELETE FROM patches"
                    where : where
                    cb    : cb
        ], (err) => opts.cb?(err))

    unarchive_patches: (opts) =>
        opts = defaults opts,
            string_id : required
            cb        : undefined
        dbg = @_dbg("unarchive_patches(string_id='#{opts.string_id}')")
        where = {"string_id = $::CHAR(40)" : opts.string_id}
        @_query
            query : "SELECT archived FROM syncstrings"
            where : where
            cb    : one_result 'archived', (err, blob_uuid) =>
                if err or not blob_uuid?
                    opts.cb?(err)
                    return
                blob = undefined
                async.series([
                    (cb) =>
                        dbg("download blob")
                        @get_blob
                            uuid : blob_uuid
                            cb   : (err, x) =>
                                if err
                                    cb(err)
                                else if not x?
                                    cb("blob is gone")
                                else
                                    blob = x
                                    cb(err)
                    (cb) =>
                        dbg("extract blob")
                        try
                            patches = JSON.parse(blob)
                        catch e
                            cb("corrupt patches blob -- #{e}")
                            return
                        if patches.length == 0
                            cb()
                            return
                        if patches[0].id?
                            # convert from OLD RethinkDB format!
                            v = []
                            for x in patches
                                patch =
                                    string_id : x.id[0]
                                    time      : new Date(x.id[1])
                                    user_id   : x.user
                                    patch     : x.patch
                                    snapshot  : x.snapshot
                                    sent      : x.sent
                                    prev      : x.prev
                                v.push(patch)
                            patches = v
                        dbg("insert patches into patches table")
                        # We break into blocks since there is limit (about 65K) on
                        # number of params that can be inserted in a single query.
                        insert_block_size = 1000
                        f = (i, cb) =>
                            @_query
                                query    : 'INSERT INTO patches'
                                values   : patches.slice(insert_block_size*i, insert_block_size*(i+1))
                                conflict : 'ON CONFLICT DO NOTHING'  # in case multiple servers (or this server) are doing this unarchive at once -- this can and does happen sometimes.
                                cb       : cb
                        async.mapSeries([0...patches.length/insert_block_size], f, cb)
                    (cb) =>
                        async.parallel([
                            (cb) =>
                                dbg("update syncstring to indicate that patches are now available")
                                @_query
                                    query : "UPDATE syncstrings SET archived=NULL"
                                    where : where
                                    cb    : cb
                            (cb) =>
                                dbg('delete blob, which is no longer needed')
                                @delete_blob
                                    uuid : blob_uuid
                                    cb   : cb
                        ], cb)
                ], (err) => opts.cb?(err))

    delete_blob: (opts) =>
        opts = defaults opts,
            uuid : required
            cb   : undefined
        if not misc.is_valid_uuid_string(opts.uuid)
            opts.cb?("uuid is invalid")
            return
        gcloud = undefined
        dbg = @_dbg("delete_blob(uuid='#{opts.uuid}')")
        async.series([
            (cb) =>
                dbg("check if blob in gcloud")
                @_query
                    query : "SELECT gcloud FROM blobs"
                    where : "id = $::UUID" : opts.uuid
                    cb    : one_result 'gcloud', (err, x) =>
                        gcloud = x
                        cb(err)
            (cb) =>
                if not gcloud
                    cb()
                    return
                dbg("delete from gcloud")
                @gcloud().bucket(name:gcloud).delete
                    name : opts.uuid
                    cb   : cb
            (cb) =>
                dbg("delete from local database")
                @_query
                    query : "DELETE FROM blobs"
                    where : "id = $::UUID" : opts.uuid
                    cb    : cb
        ], (err) => opts.cb?(err))

