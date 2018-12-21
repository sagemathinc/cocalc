###############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

###
Database-backed time-log database-based synchronized editing
###

# How big of files we allow users to open using syncstrings.
MAX_FILE_SIZE_MB = 2

# Client -- when it has this syncstring open and connected -- will touch the
# syncstring every so often so that it stays opened in the local hub,
# when the local hub is running.
TOUCH_INTERVAL_M = 10

# How often the local hub will autosave this file to disk if it has it open and
# there are unsaved changes.  This is very important since it ensures that a user that
# edits a file but doesn't click "Save" and closes their browser (right after their edits
# have gone to the database), still has their file saved to disk soon.  This is important,
# e.g., for homework getting collected and not missing the last few changes.  It turns out
# this is what people expect.
# Set to 0 to disable. (But don't do that.)
LOCAL_HUB_AUTOSAVE_S = 45
#LOCAL_HUB_AUTOSAVE_S = 5

# If the client becomes disconnected from the backend for more than this long
# the---on reconnect---do extra work to ensure that all snapshots are up to
# date (in case snapshots were made when we were offline), and mark the sent
# field of patches that weren't saved.
OFFLINE_THRESH_S = 5*60

{EventEmitter} = require('events')
immutable = require('immutable')
underscore = require('underscore')

node_uuid = require('uuid')
async     = require('async')

misc      = require('./misc')
{sagews}  = require('./sagews')

schema    = require('./schema')

{failing_to_save} = require('./failing-to-save')

{Evaluator} = require('./syncstring_evaluator')

{diff_match_patch} = require('./dmp')
dmp = new diff_match_patch()
dmp.Diff_Timeout = 0.2        # computing a diff won't block longer than about 0.2s
exports.dmp = dmp

{defaults, required} = misc

# Here's what a diff-match-patch patch looks like
#
# [{"diffs":[[1,"{\"x\":5,\"y\":3}"]],"start1":0,"start2":0,"length1":0,"length2":13},...]
#
compress_patch = (patch) ->
    ([p.diffs, p.start1, p.start2, p.length1, p.length2] for p in patch)

decompress_patch = (patch) ->
    ({diffs:p[0], start1:p[1], start2:p[2], length1:p[3], length2:p[4]} for p in patch)

# patch that transforms s0 into s1
exports.make_patch = make_patch = (s0, s1) ->
    p = compress_patch(dmp.patch_make(s0, s1))
    #console.log("make_patch: #{misc.to_json(p)}")
    return p

exports.apply_patch = apply_patch = (patch, s) ->
    try
        x = dmp.patch_apply(decompress_patch(patch), s)
        #console.log('patch_apply ', misc.to_json(decompress_patch(patch)), x)
    catch err
        # If a patch is so corrupted it can't be parsed -- e.g., due to a bug in SMC -- we at least
        # want to make application the identity map, so the document isn't completely unreadable!
        console.warn("apply_patch -- #{err}")
        return [s, false]
    clean = true
    for a in x[1]
        if not a
            clean = false
            break
    return [x[0], clean]

patch_cmp = (a, b) ->
    return misc.cmp_array([a.time - 0, a.user_id], [b.time - 0, b.user_id])

time_cmp = (a,b) ->
    return a - b   # sorting Date objects doesn't work perfectly!

# Do a 3-way **string** merge by computing patch that transforms
# base to remote, then applying that patch to local.
exports.three_way_merge = (opts) ->
    opts = defaults opts,
        base   : required
        local  : required
        remote : required
    if opts.base == opts.remote # trivial special case...
        return opts.local
    return dmp.patch_apply(dmp.patch_make(opts.base, opts.remote), opts.local)[0]


###
The PatchValueCache is used to cache values returned
by SortedPatchList.value.  Caching is critical, since otherwise
the client may have to apply hundreds of patches after ever
few keystrokes, which would make SMC unusable.  Also, the
history browser is very painful to use without caching.
###
MAX_PATCHLIST_CACHE_SIZE = 20
class PatchValueCache
    constructor: () ->
        @cache = {}

    # Remove everything from the value cache that has timestamp >= time.
    # If time not defined, removes everything, thus emptying the cache.
    invalidate: (time) =>
        if not time?
            @cache = {}
            return
        time0 = time - 0
        for tm, _ of @cache
            if parseInt(tm) >= time0
                delete @cache[tm]
        return

    # Ensure the value cache doesn't have too many entries in it by
    # removing all but n of the ones that have not been accessed recently.
    prune: (n) =>
        v = []
        for time, x of @cache
            v.push({time:time, last_used:x.last_used})
        if v.length <= n
            # nothing to do
            return
        v.sort((a,b) -> misc.cmp_Date(a.last_used, b.last_used))
        for x in v.slice(0, v.length - n)
            delete @cache[x.time]
        return

    # Include the given value at the given point in time, which should be
    # the output of @value(time), and should involve applying all patches
    # up to @_patches[start-1].
    include: (time, value, start) =>
        @cache[time - 0] = {time:time, value:value, start:start, last_used:new Date()}
        return

    # Return the newest value x with x.time <= time in the cache as an object
    #    x={time:time, value:value, start:start},
    # where @value(time) is the given value, and it was obtained
    # by applying the elements of @_patches up to @_patches[start-1]
    # Return undefined if there are no cached values.
    # If time is undefined, returns the newest value in the cache.
    # If strict is true, returns newest value at time strictly older than time
    newest_value_at_most: (time, strict=false) =>
        v = misc.keys(@cache)
        if v.length == 0
            return
        v.sort(misc.cmp)
        v.reverse()
        if not time?
            return @get(v[0])
        time0 = time - 0
        for t in v
            if (not strict and t <= time0) or (strict and t < time0)
                return @get(t)
        return

    # Return cached value corresponding to the given point in time.
    # Here time must be either a new Date() object, or a number (ms since epoch).
    # If there is nothing in the cache for the given time, returns undefined.
    # Do NOT mutate the returned value.
    get: (time) =>
        if typeof(time) != 'number'
            # also allow dates
            time = time - 0
        x = @cache[time]
        if not x?
            return
        x.last_used = new Date()   # this is only for the client cache, so fine to use browser's clock
        return x

    oldest_time: () =>
        v = misc.keys(@cache)
        if v.length == 0
            return
        v.sort(misc.cmp)
        return new Date(parseInt(v[0]))

    # Number of cached values
    size: () =>
        return misc.len(@cache)

# Sorted list of patches applied to a string
class SortedPatchList extends EventEmitter
    constructor: (_from_str) ->
        super()
        @_from_str = _from_str
        @_patches = []
        @_times = {}
        @_cache = new PatchValueCache()
        @_snapshot_times = {}

    close: () =>
        @removeAllListeners()
        delete @_patches
        delete @_times
        delete @_cache
        delete @_snapshot_times

    # Choose the next available time in ms that is congruent to m modulo n.
    # The congruence condition is so that any time collision will have to be
    # with a single person editing a document with themselves -- two different
    # users are guaranteed to not collide.  Note: even if there is a collision,
    # it will automatically fix itself very quickly.
    next_available_time: (time, m=0, n=1) =>
        if misc.is_date(time)
            t = time - 0
        else
            t = time

        if n <= 0
            n = 1
        a = m - (t%n)
        if a < 0
            a += n
        t += a  # now t = m (mod n)
        while @_times[t]?
            t += n
        return new Date(t)

    _ensure_time_field_is_valid: (patch, field) ->
        # Ensure patch[field] is a valid Date object or undefined; if neither, returns true,
        # which means this patch is hopeless corrupt and should be ignored
        # (should be impossible given postgres data types)
        val = patch[field]
        if not val? or misc.is_date(val)
            return
        try
            patch[field] = misc.ISO_to_Date(val)
            return false
        catch err
            return true # BAD

    add: (patches) =>
        if patches.length == 0
            # nothing to do
            return
        #console.log("SortedPatchList.add: #{misc.to_json(patches)}")
        v = []
        oldest = undefined
        for x in patches
            if x?
                # ensure that time and prev fields is a valid Date object
                if @_ensure_time_field_is_valid(x, 'time')
                    continue
                if @_ensure_time_field_is_valid(x, 'prev')
                    continue
                t   = x.time - 0
                cur = @_times[t]
                if cur?
                    # Note: cur.prev and x.prev are Date objects, so must put + before them to convert to numbers and compare.
                    if underscore.isEqual(cur.patch, x.patch) and cur.user_id == x.user_id and cur.snapshot == x.snapshot and +cur.prev == +x.prev
                        # re-inserting exactly the same thing; nothing at all to do
                        continue
                    else
                        # adding snapshot or timestamp collision -- remove duplicate
                        #console.log "overwriting patch #{misc.to_json(t)}"
                        # remove patch with same timestamp from the sorted list of patches
                        @_patches = (y for y in @_patches when y.time - 0 != t)
                        @emit('overwrite', t)
                v.push(x)
                @_times[t] = x
                if not oldest? or oldest > x.time
                    oldest = x.time
                if x.snapshot?
                    @_snapshot_times[t] = true
        if oldest?
            @_cache.invalidate(oldest)

        # this is O(n*log(n)) where n is the length of @_patches and patches;
        # better would be an insertion sort which would be O(m*log(n)) where m=patches.length...
        if v.length > 0
            delete @_versions_cache
            @_patches = @_patches.concat(v)
            @_patches.sort(patch_cmp)

    newest_snapshot_time: () =>
        t0 = 0
        for t of @_snapshot_times
            t = parseInt(t)
            if t > t0
                t0 = t
        return new Date(t0)

    ###
    value: Return the value of the string at the given (optional)
    point in time.  If the optional time is given, only include patches up
    to (and including) the given time; otherwise, return current value.

    If force is true, doesn't use snapshot at given input time, even if
    there is one; this is used to update snapshots in case of offline changes
    getting inserted into the changelog.

    If without_times is defined, it must be an array of Date objects; in that case
    the current value of the string is computed, but with all the patches
    at the given times in "without_times" ignored.  This is used elsewhere
    as a building block to implement undo.
    ###
    value: (time, force=false, without_times=undefined) =>
        #start_time = new Date()

        if time? and not misc.is_date(time)
            # If the time is specified, verify that it is valid; otherwise, convert it to a valid time.
            time = misc.ISO_to_Date(time)

        if without_times?
            # Process without_times to get a map from time numbers to true.
            if not misc.is_array(without_times)
                throw Error("without_times must be an array")
            if without_times.length > 0
                v = {}
                without = undefined
                for x in without_times
                    if not misc.is_date(x)
                        throw Error("each without_times entry must be a date")
                    v[+x] = true  # convert to number
                    if not without? or x < without
                        without = x
                if time? and +time < without
                    # requesting value at time before any without, so without is not relevant, so ignore.
                    without = undefined
                    without_times = undefined
                else
                    without_times = v # change to map from time in ms to true.

        prev_cutoff = @newest_snapshot_time()   # we do not discard patch due to prev if prev is before this.

        # Determine oldest cached value
        oldest_cached_time = @_cache.oldest_time()  # undefined if nothing cached
        # If the oldest cached value exists and is at least as old as the requested
        # point in time, use it as a base.
        if oldest_cached_time? and (not time? or +time >= +oldest_cached_time) and (not without? or +without > +oldest_cached_time)
            # There is something in the cache, and it is at least as far back in time
            # as the value we want to compute now.
            if without?
                cache = @_cache.newest_value_at_most(without, true)  # true makes "at most" strict, so <.
            else
                cache = @_cache.newest_value_at_most(time)
            value = cache.value
            start = cache.start
            cache_time = cache.time
            for x in @_patches.slice(cache.start, @_patches.length)   # all patches starting with the cached one
                if time? and x.time > time
                    # Done -- no more patches need to be applied
                    break
                if not x.prev? or @_times[x.prev - 0] or +x.prev <= +prev_cutoff
                    if not without? or (without? and not without_times[+x.time])
                        # apply patch x to update value to be closer to what we want
                        value = value.apply_patch(x.patch)
                cache_time = x.time                      # also record the time of the last patch we applied.
                start += 1
            if not without? and (not time? or start - cache.start >= 10)
                # Newest -- or at least 10 patches needed to be applied -- so cache result
                @_cache.include(cache_time, value, start)
                @_cache.prune(Math.max(3, Math.min(Math.ceil(30000000/value.length), MAX_PATCHLIST_CACHE_SIZE)))
        else
            # Cache is empty or doesn't have anything sufficiently old to be useful.
            # Find the newest snapshot at a time that is <= time.
            value = @_from_str('') # default in case no snapshots
            start = 0
            if @_patches.length > 0  # otherwise the [..] notation below has surprising behavior
                for i in [@_patches.length-1 .. 0]
                    if (not time? or +@_patches[i].time <= +time) and @_patches[i].snapshot?
                        if force and +@_patches[i].time == +time
                            # If force is true we do NOT want to use the existing snapshot, since
                            # the whole point is to force recomputation of it, as it is wrong.
                            # Instead, we'll use the previous snapshot.
                            continue
                        # Found a patch with known snapshot that is as old as the time.
                        # This is the base on which we will apply other patches to move forward
                        # to the requested time.
                        value = @_from_str(@_patches[i].snapshot)
                        start = i + 1
                        break
            # Apply each of the patches we need to get from
            # value (the last snapshot) to time.
            cache_time = 0
            cache_start = start
            for x in @_patches.slice(start, @_patches.length)
                if time? and x.time > time
                    # Done -- no more patches need to be applied
                    break
                # Apply a patch to move us forward.
                #console.log("applying patch #{i}")
                if not x.prev? or @_times[x.prev - 0] or +x.prev <= +prev_cutoff
                    if not without? or (without? and not without_times[+x.time])
                        try
                            value = value.apply_patch(x.patch)
                        catch err
                            # See https://github.com/sagemathinc/cocalc/issues/3191
                            # This apply_patch *can* fail in practice due to
                            # a horrible massively nested data structure that appears
                            # due to a bug.  This happened with #3191.  It's better
                            # just skip the patch than to make the project and all
                            # files basically be massively broken!
                            console.warn("WARNING: unable to apply a patch -- skipping it", err)
                cache_time = x.time
                cache_start += 1
            if not without? and (not time? or cache_time and cache_start - start >= 10)
                # Newest -- or at least 10 patches needed to be applied -- so
                # update the cache with our new known value
                @_cache.include(cache_time, value, cache_start)
                @_cache.prune(Math.max(3, Math.min(Math.ceil(30000000/value.length), MAX_PATCHLIST_CACHE_SIZE)))

        #console.log("value: time=#{new Date() - start_time}")
        # Use the following only for testing/debugging, since it will make everything VERY slow.
        #if @_value_no_cache(time) != value
        #    console.warn("value for time #{time-0} is wrong!")
        return value

    # VERY Slow -- only for consistency checking purposes and debugging.
    # If snapshots=false, don't use snapshots.
    _value_no_cache: (time, snapshots=true) =>
        value = @_from_str('') # default in case no snapshots
        start = 0
        prev_cutoff = @newest_snapshot_time()
        if snapshots and @_patches.length > 0  # otherwise the [..] notation below has surprising behavior
            for i in [@_patches.length-1 .. 0]
                if (not time? or +@_patches[i].time <= +time) and @_patches[i].snapshot?
                    # Found a patch with known snapshot that is as old as the time.
                    # This is the base on which we will apply other patches to move forward
                    # to the requested time.
                    value = @_from_str(@_patches[i].snapshot)
                    start = i + 1
                    break
        # Apply each of the patches we need to get from
        # value (the last snapshot) to time.
        for x in @_patches.slice(start, @_patches.length)
            if time? and x.time > time
                # Done -- no more patches need to be applied
                break
            if not x.prev? or @_times[x.prev - 0] or +x.prev <= +prev_cutoff
                value = value.apply_patch(x.patch)
            else
                console.log 'skipping patch due to prev', x
        return value

    # For testing/debugging.  Go through the complete patch history and
    # verify that all snapshots are correct (or not -- in which case say so).
    _validate_snapshots: =>
        if @_patches.length == 0
            return
        i = 0
        if @_patches[0].snapshot?
            i += 1
            value = @_from_str(@_patches[0].snapshot)
        else
            value = @_from_str('')
        for x in @_patches.slice(i)
            value = value.apply_patch(x.patch)
            if x.snapshot?
                snapshot_value = @_from_str(x.snapshot)
                if not value.is_equal(snapshot_value)
                    console.log("FAIL (#{x.time}): at #{i}")
                    console.log("diff(snapshot, correct)=")
                    console.log(JSON.stringify(value.make_patch(snapshot_value)))
                else
                    console.log("GOOD (#{x.time}): snapshot at #{i} by #{x.user_id}")
            i += 1
        return

    # integer index of user who made the edit at given point in time (or undefined)
    user_id: (time) =>
        return @patch(time)?.user_id

    time_sent: (time) =>
        return @patch(time)?.sent

    # patch at a given point in time
    # TODO: optimization -- this shouldn't be a linear search!!
    patch: (time) =>
        for x in @_patches
            if +x.time == +time
                return x

    versions: () =>
        # Compute and cache result,then return it; result gets cleared when new patches added.
        return @_versions_cache ?= (x.time for x in @_patches)

    # Show the history of this document; used mainly for debugging purposes.
    show_history: (opts={}) =>
        opts = defaults opts,
            milliseconds : false
            trunc        : 80
            log          : console.log
        s = undefined
        i = 0
        prev_cutoff = @newest_snapshot_time()
        for x in @_patches
            tm = x.time
            tm = if opts.milliseconds then tm - 0 else tm.toLocaleString()
            opts.log("-----------------------------------------------------\n", i, x.user_id, tm,  misc.trunc_middle(JSON.stringify(x.patch), opts.trunc))
            if not s?
                s = @_from_str(x.snapshot ? '')
            if not x.prev? or @_times[x.prev - 0] or +x.prev <= +prev_cutoff
                t = s.apply_patch(x.patch)
            else
                opts.log("prev=#{x.prev} missing, so not applying")
            s = t
            opts.log((if x.snapshot then "(SNAPSHOT) " else "           "), if s? then JSON.stringify(misc.trunc_middle(s.to_str(), opts.trunc).trim()))
            i += 1
        return

    # If the number of patches since the most recent snapshot is >= 2*interval,
    # make a snapshot at the patch that is interval steps forward from
    # the most recent snapshot. This function returns the time at which we
    # must make a snapshot.
    time_of_unmade_periodic_snapshot: (interval) =>
        n = @_patches.length - 1
        if n < 2*interval
            # definitely no need to make a snapshot
            return
        for i in [n .. n - 2*interval]
            if @_patches[i].snapshot?
                if i + interval + interval <= n
                    return @_patches[i + interval].time
                else
                    # found too-recent snapshot so don't need to make another one
                    return
        # No snapshot found at all -- maybe old ones were deleted.
        # We return the time at which we should have the *newest* snapshot.
        # This is the largest multiple i of interval that is <= n - interval
        i = Math.floor((n - interval) / interval) * interval
        return @_patches[i]?.time

    # Times of all snapshots in memory on this client; these are the only ones
    # we need to worry about for offline patches...
    snapshot_times: =>
        return (x.time for x in @_patches when x.snapshot?)

    newest_patch_time: =>
        return @_patches[@_patches.length-1]?.time

    count: =>
        return @_patches.length


# For testing purposes
exports.SortedPatchList = SortedPatchList

###
The SyncDoc class enables synchronized editing of a document that can be represented by a string.

EVENTS:

 - 'change' event whenever the document is changed *remotely* (NOT locally), and also once
   when document is initialized.

 - 'user_change' when the string is definitely changed locally (so a new patch is recorded)

STATES:


###

class SyncDoc extends EventEmitter
    constructor: (opts) ->
        super()
        @_opts = opts = defaults opts,
            save_interval     : 2000
            cursor_interval   : 1000
            patch_interval    : 1500       # debouncing of incoming upstream patches
            file_use_interval : 'default'  # throttles: default is 60s for everything except .sage-chat files, where it is 10s.
            string_id         : undefined
            project_id        : required   # project_id that contains the doc
            path              : required   # path of the file corresponding to the doc
            client            : required
            cursors           : false      # if true, also provide cursor tracking functionality
            from_str          : required   # creates a doc from a string.
            doctype           : undefined  # optional object describing document constructor (used by project to open file)
            from_patch_str    : JSON.parse
            before_change_hook : undefined
            after_change_hook : undefined

        @setMaxListeners(100)
        @_before_change_hook = opts.before_change_hook
        @_after_change_hook = opts.after_change_hook

        if not opts.string_id?
            opts.string_id = schema.client_db.sha1(opts.project_id, opts.path)

        @_closed         = true
        @_string_id      = opts.string_id
        @_project_id     = opts.project_id
        @_path           = opts.path
        @_client         = opts.client
        @_from_str       = opts.from_str
        @_from_patch_str = opts.from_patch_str
        @_doctype        = opts.doctype
        @_patch_format   = opts.doctype.patch_format
        @_save_interval  = opts.save_interval
        @_patch_interval = opts.patch_interval

        @_my_patches    = {}  # patches that this client made during this editing session.

        # For debugging -- this is a (slight) security risk in production.
        ###
        if window?
            window.syncstrings ?= {}
            window.syncstrings[@_path] = @
        ###

        ## window?.s = @

        #dbg = @dbg("constructor(path='#{@_path}')")
        #dbg('connecting...')
        @connect (err) =>
            #dbg('connected')
            if err
                console.warn("error creating SyncDoc: '#{err}'")
                @emit('error', err)
            else
                if @_client.is_project()
                    # CRITICAL: do not start autosaving this until syncstring is initialized!
                    @init_project_autosave()
                else
                    # Ensure file is undeleted when explicitly open.
                    @_undelete()

        if opts.file_use_interval and @_client.is_user()
            is_chat = misc.filename_extension(@_path) == 'sage-chat'
            if is_chat
                action = 'chat'
            else
                action = 'edit'
            @_last_user_change = misc.minutes_ago(60)  # initialize
            file_use = () =>
                # We ONLY count this and record that the file was edited if there was an actual
                # change record in the patches log, by this user, since last time.
                user_is_active = false
                for tm, _ of @_my_patches
                    if new Date(parseInt(tm)) > @_last_user_change
                        user_is_active = true
                        break
                if not user_is_active
                    return
                @_last_user_change = new Date()
                @_client.mark_file(project_id:@_project_id, path:@_path, action:action, ttl:opts.file_use_interval)

            @on('user_change', underscore.throttle(file_use, opts.file_use_interval, true))

        if opts.cursors
            # Initialize throttled cursors functions
            set_cursor_locs = (locs, side_effect) =>
                if not @_last_user_change? or new Date() - @_last_user_change >= 1000*5*60
                    # We ignore setting cursor location in case the user hasn't actually
                    # modified this file recently (5 minutes).  It's annoying to just see a cursor
                    # moving around for a user who isn't doing anything, and this also
                    # prevents bugs in side_effect detection (which is super hard to
                    # get right).
                    return
                x =
                    string_id : @_string_id
                    user_id   : @_user_id
                    locs      : locs
                if not side_effect
                    x.time = @_client.server_time()
                @_cursors?.set(x, 'none')
            @_throttled_set_cursor_locs = underscore.throttle(set_cursor_locs, @_opts.cursor_interval, {leading:true, trailing:true})

    set_doc: (value) =>
        if not value?.apply_patch?
            # Do a sanity check -- see https://github.com/sagemathinc/cocalc/issues/1831
            throw Error("value must be a document object with apply_patch, etc., methods")
        @_doc = value
        return

    # Reconnect all the syncstring and patches tables, which
    # define this syncstring.
    reconnect: =>
        @_syncstring_table?.reconnect()
        @_patches_table?.reconnect()

    # Return underlying document, or undefined if document hasn't been set yet.
    get_doc: =>
        return @_doc

    # Set this doc from its string representation.
    from_str: (value) =>
        @_doc = @_from_str(value)
        return

    # Return string representation of this doc, or undefined if the doc hasn't been set yet.
    to_str: =>
        return @_doc?.to_str?()

    # Used for internal debug logging
    dbg: (f) ->
        return @_client.dbg("SyncString(path='#{@_path}').#{f}:")

    # Version of the document at a given point in time; if no
    # time specified, gives the version right now.
    # If not fully initialized, will return undefined
    version: (time) =>
        return @_patch_list?.value(time)

    # Compute version of document if the patches at the given times were simply not included.
    # This is a building block that is used for implementing undo functionality for client editors.
    version_without: (times) =>
        return @_patch_list.value(undefined, undefined, times)

    revert: (version) =>
        @set_doc(@version(version))
        return

    # Undo/redo public api.
    #   Calling @undo and @redo returns the version of the document after
    #   the undo or redo operation, but does NOT otherwise change anything!
    #   The caller can then do what they please with that output (e.g., update the UI).
    #   The one state change is that the first time calling @undo or @redo switches
    #   into undo/redo state in which additional calls to undo/redo
    #   move up and down the stack of changes made by this user during this session.
    #   Call @exit_undo_mode() to exit undo/redo mode.
    #   Undo and redo *only* impact changes made by this user during this session.
    #   Other users edits are unaffected, and work by this same user working from another
    #   browser tab or session is also unaffected.
    #
    #   Finally, undo of a past patch by definition means "the state of the document"
    #   if that patch was not applied.  The impact of undo is NOT that the patch is
    #   removed from the patch history; instead it just returns a document here that
    #   the client can do something with, which may result in future patches.   Thus
    #   clients could implement a number of different undo strategies without impacting
    #   other clients code at all.
    undo: () =>
        state = @_undo_state
        if not state?
            # not in undo mode
            state = @_undo_state = @_init_undo_state()
        if state.pointer == state.my_times.length
            # pointing at live state (e.g., happens on entering undo mode)
            value = @version()     # last saved version
            live  = @_doc
            if not value?
                # may be undefined if everything not fully loaded or being reconnected -- in this case, just skip
                # doing the undo, which would be dangerous, e.g., value.make_patch(live) is not going to work.
                # See https://github.com/sagemathinc/cocalc/issues/2586
                return live
            if not live.is_equal(value)
                # User had unsaved changes, so last undo is to revert to version without those.
                state.final    = value.make_patch(live)                  # live redo if needed
                state.pointer -= 1  # most recent timestamp
                return value
            else
                # User had no unsaved changes, so last undo is version without last saved change.
                tm = state.my_times[state.pointer - 1]
                state.pointer -= 2
                if tm?
                    state.without.push(tm)
                    return @version_without(state.without)
                else
                    # no undo information during this session
                    return value
        else
            # pointing at particular timestamp in the past
            if state.pointer >= 0
                # there is still more to undo
                state.without.push(state.my_times[state.pointer])
                state.pointer -= 1
            return @version_without(state.without)

    redo: () =>
        state = @_undo_state
        if not state?
            # nothing to do but return latest live version
            return @get_doc()
        if state.pointer == state.my_times.length
            # pointing at live state -- nothing to do
            return @get_doc()
        else if state.pointer == state.my_times.length - 1
            # one back from live state, so apply unsaved patch to live version
            value = @version()
            if not value? # see remark in undo -- do nothing
                return @get_doc()
            state.pointer += 1
            return value.apply_patch(state.final)
        else
            # at least two back from live state
            state.without.pop()
            state.pointer += 1
            if not state.final? and state.pointer == state.my_times.length - 1
                # special case when there wasn't any live change
                state.pointer += 1
            return @version_without(state.without)

    in_undo_mode: () =>
        return @_undo_state?

    exit_undo_mode: () =>
        delete @_undo_state

    _init_undo_state: () =>
        if @_undo_state?
            @_undo_state
        state = @_undo_state = {}
        state.my_times = (new Date(parseInt(x)) for x in misc.keys(@_my_patches))
        state.my_times.sort(misc.cmp_Date)
        state.pointer = state.my_times.length
        state.without = []
        return state

    # Make it so the local hub project will automatically save the file to disk periodically.
    init_project_autosave: () =>
        # Do not autosave sagews until https://github.com/sagemathinc/cocalc/issues/974 is resolved.
        if not LOCAL_HUB_AUTOSAVE_S or not @_client.is_project() or @_project_autosave? or misc.endswith(@_path, '.sagews')
            return
        dbg = @dbg("autosave")
        dbg("initializing")
        f = () =>
            #dbg('checking')
            if @hash_of_saved_version()? and @has_unsaved_changes()
                #dbg("doing")
                @_save_to_disk()
        @_project_autosave = setInterval(f, LOCAL_HUB_AUTOSAVE_S*1000)

    # account_id of the user who made the edit at
    # the given point in time.
    account_id: (time) =>
        return @_users[@user_id(time)]

    # Approximate time when patch with given timestamp was
    # actually sent to the server; returns undefined if time
    # sent is approximately the timestamp time.  Only not undefined
    # when there is a significant difference.
    time_sent: (time) =>
        @_patch_list.time_sent(time)

    # integer index of user who made the edit at given
    # point in time.
    user_id: (time) =>
        return @_patch_list.user_id(time)

    # Indicate active interest in syncstring; only updates time
    # if last_active is at least min_age_m=5 minutes old (so this can be safely
    # called frequently without too much load).  We do *NOT* use
    # "@_syncstring_table.set(...)" below because it is critical to
    # to be able to do the touch before @_syncstring_table gets initialized,
    # since otherwise the initial open a file will be very slow.
    touch: (min_age_m=5, cb) =>
        if @_client.is_project()
            cb?()
            return
        if min_age_m > 0
            # if min_age_m is 0 always try to do it immediately; if > 0 check what it was:
            last_active = @_syncstring_table?.get_one()?.get('last_active')
            # if not defined or not set recently, do it.
            if not (not last_active? or +last_active <= +misc.server_minutes_ago(min_age_m))
                cb?()
                return
        # Now actually do the set.
        @_client.query
            query :
                syncstrings :
                    string_id   : @_string_id
                    project_id  : @_project_id
                    path        : @_path
                    deleted     : @_deleted
                    last_active : misc.server_time()
                    doctype     : misc.to_json(@_doctype)  # important to set here, since this is when syncstring is often first created
            cb: cb


    # The project calls this once it has checked for the file on disk; this
    # way the frontend knows that the syncstring has been initialized in
    # the database, and also if there was an error doing the check.
    _set_initialized: (error, is_read_only, size, cb) =>
        init = {time: misc.server_time(), size:size}
        if error
            init.error = "error - #{JSON.stringify(error)}"  # must be a string!
        else
            init.error = ''
        @_client.query
            query :
                syncstrings :
                    string_id  : @_string_id
                    project_id : @_project_id
                    path       : @_path
                    init       : init
                    read_only  : is_read_only
            cb : cb

    # List of timestamps of the versions of this string in the sync
    # table that we opened to start editing (so starts with what was
    # the most recent snapshot when we started).  The list of timestamps
    # is sorted from oldest to newest.
    versions: () =>
        v = []
        @_patches_table.get().map (x, id) =>
            v.push(x.get('time'))
        v.sort(time_cmp)
        return v

    # List of all known timestamps of versions of this string, including
    # possibly much older versions than returned by @versions(), in
    # case the full history has been loaded.  The list of timestamps
    # is sorted from oldest to newest.
    all_versions: () =>
        return @_patch_list?.versions()

    last_changed: () =>
        v = @versions()
        if v.length > 0
            return v[v.length-1]
        else
            return new Date(0)

    # Close synchronized editing of this string; this stops listening
    # for changes and stops broadcasting changes.
    close: =>
        if @_closed
            return
        @emit('close')
        @removeAllListeners()  # must be after @emit('close') above.
        @_closed = true
        if @_periodically_touch?
            clearInterval(@_periodically_touch)
            delete @_periodically_touch
        if @_project_autosave?
            clearInterval(@_project_autosave)
            delete @_project_autosave
        delete @_cursor_map
        delete @_users
        @_syncstring_table?.close()
        delete @_syncstring_table
        @_patches_table?.close()
        delete @_patches_table
        @_patch_list?.close()
        delete @_patch_list
        @_cursors?.close()
        delete @_cursors
        if @_client.is_project()
            @_update_watch_path()  # no input = closes it
        @_evaluator?.close()
        delete @_evaluator

    connect: (cb) =>
        if not @_closed
            cb?("already connected")
            return
        query =
            syncstrings :
                string_id         : @_string_id
                project_id        : @_project_id
                path              : @_path
                deleted           : null
                users             : null
                last_snapshot     : null
                snapshot_interval : null
                save              : null
                last_active       : null
                init              : null
                read_only         : null
                last_file_change  : null
                doctype           : null
                archived          : null
                settings          : null

        async.series([
            (cb) =>
                # It is critical to do a quick initial touch so file gets opened on the
                # backend or syncstring gets created (otherwise creation of various
                # changefeeds below will FATAL fail).
                @touch(0, cb)
            (cb) =>
                @_syncstring_table = @_client.sync_table(query)
                @_syncstring_table.once 'connected', =>
                    @_handle_syncstring_update()
                    @_syncstring_table.on('change', @_handle_syncstring_update)
                    cb()
            (cb) =>
                # wait until syncstring is not archived -- if we open a very old syncstring, the patches
                # may be archived; we have to wait until after they have been pulled from blob storage before
                # we init the patch table below, load from disk, etc.
                @_syncstring_table.wait
                    until : (t) => not t.get_one()?.get('archived')
                    cb    : cb
            (cb) =>
                async.parallel([@_init_patch_list, @_init_cursors, @_init_evaluator], cb)
            (cb) =>
                @_closed = false
                if @_client.is_user() and not @_periodically_touch?
                    @touch(1)
                    # touch every few minutes while syncstring is open, so that backend local_hub
                    # (if open) keeps its side open
                    @_periodically_touch = setInterval((=>@touch(TOUCH_INTERVAL_M/2)), 1000*60*TOUCH_INTERVAL_M)
                if @_client.is_project()
                    @_load_from_disk_if_newer(cb)
                else
                    cb()
        ], (err) =>
            if @_closed
                # closed while connecting...
                cb()
                return

            if err
                cb(err)
            else
                # Emit 'init' when ready for use.
                @_wait_init()
                @emit('change')
                @emit('connected')
                cb()
        )

    # wait until the syncstring table is ready to be used (so extracted from archive, etc.),
    # and only then emit an init.
    _wait_init: =>
        @_syncstring_table?.wait
            until : (t) =>
                tbl = t.get_one()
                # init must be set in table and archived must NOT be set (so patches are loaded from blob store)
                init = tbl?.get('init')
                if init and not tbl?.get('archived')
                    return init
                else
                    return false
            cb    : (err, init) =>
                if @_closed # closed while waiting on condition (perfectly reasonable -- do nothing).
                    return
                if err
                    @emit('init', err)
                    return
                init = init.toJS()
                err  = init.error
                if err
                    @emit('init', err)
                    return
                if @_client.is_user() and @_patch_list.count() == 0 and (init.size ? 0) > 0
                    # wait for a change -- i.e., project loading the file from
                    # disk and making available...  Because init.size > 0, we know that
                    # there must be SOMETHING in the patches table once initialization is done.
                    # This is the root cause of https://github.com/sagemathinc/cocalc/issues/2382
                    @_patches_table.once 'change', =>
                        @emit('init')
                else
                    @emit('init')

    wait: (opts) =>
        if not @_patches_table?
            @_patches_table_queue ?= []
            @_patches_table_queue.push(opts)
            return
        @_patches_table.wait
            timeout : opts.timeout
            until : => return opts.until(@)
            cb    : opts.cb

    # Delete the synchronized string and **all** patches from the database -- basically
    # delete the complete history of editing this file.
    # WARNINGS:
    #   (1) If a project has this string open, then things may be messed up, unless that project is restarted.
    #   (2) Only available for the admin user right now.
    # To use: from a javascript console in the browser as admin, you can do:
    #
    #   smc.client.sync_string({project_id:'9f2e5869-54b8-4890-8828-9aeba9a64af4', path:'a.txt'}).delete_from_database(console.log)
    #
    # Then make sure project and clients refresh.
    #
    delete_from_database: (cb) =>
        async.parallel([
            (cb) =>
                @_client.query
                    query :
                        patches_delete :
                            id    : [@_string_id]
                            dummy : null  # required to force a get query.
                    cb : cb
            (cb) =>
                @_client.query
                    query :
                        syncstrings_delete :
                            project_id : @_project_id
                            path       : @_path
                    cb : cb
        ], (err)=>cb?(err))

    _file_is_read_only: (cb) =>
        @_client.path_access
            path : @_path
            mode : 'w'
            cb   : (err) =>
                cb(undefined, !!err)

    _update_if_file_is_read_only: (cb) =>
        @_file_is_read_only (err, is_read_only) =>
                @_set_read_only(is_read_only)
                cb?()

    _load_from_disk_if_newer: (cb) =>
        tm     = @last_changed()
        dbg    = @_client.dbg("syncstring._load_from_disk_if_newer('#{@_path}')")
        locals = {exists: false, is_read_only: false, size: 0}
        async.series([
            (cb) =>
                dbg("check if path exists")
                @_client.path_exists
                    path : @_path
                    cb   : (err, exists) =>
                        if err
                            cb(err)
                        else
                            locals.exists = exists
                            cb()
            (cb) =>
                if not locals.exists
                    dbg("file does NOT exist")
                    cb()
                    return
                if tm?
                    dbg("edited before, so stat file")
                    @_client.path_stat
                        path : @_path
                        cb   : (err, stats) =>
                            if err
                                cb(err)
                            else if stats.ctime > tm
                                dbg("disk file changed more recently than edits, so loading")
                                @_load_from_disk (err, size) =>
                                    locals.size = size
                                    cb(err)
                            else
                                dbg("stick with database version")
                                cb()
                else
                    dbg("never edited before")
                    if locals.exists
                        dbg("path exists, so load from disk")
                        @_load_from_disk (err, size) =>
                            locals.size = size
                            cb(err)
                    else
                        cb()
            (cb) =>
                if locals.exists
                    @_file_is_read_only (err, is_read_only) ->
                        locals.is_read_only = is_read_only
                        cb(err)
                else
                    cb()
        ], (err) =>
            @_set_initialized(err, locals.is_read_only, locals.size, cb)
        )

    _patch_table_query: (cutoff) =>
        query =
            string_id: @_string_id
            time     : if cutoff then {'>=':cutoff} else null
            patch    : null      # compressed format patch as a JSON *string*
            user_id  : null      # integer id of user (maps to syncstring table)
            snapshot : null      # (optional) a snapshot at this point in time
            sent     : null      # (optional) when patch actually sent, which may be later than when made
            prev     : null      # (optional) timestamp of previous patch sent from this session
        if @_patch_format?
            query.format = @_patch_format
        return query

    _init_patch_list: (cb) =>
        # CRITICAL: note that _handle_syncstring_update checks whether
        # init_patch_list is done by testing whether @_patch_list is defined!
        # That is why we first define "patch_list" below, then set @_patch_list
        # to it only after we're done.
        delete @_patch_list

        patch_list = new SortedPatchList(@_from_str)

        @_patches_table = @_client.sync_table({patches : @_patch_table_query(@_last_snapshot)}, \
                                              undefined, @_patch_interval, @_patch_interval)

        if @_patches_table_queue?
            for opts in @_patches_table_queue
                @wait(opts)

        @_patches_table.once 'connected', =>
            patch_list.add(@_get_patches())
            doc = patch_list.value()
            @_last = @_doc = doc
            @_patches_table.on('change', @_handle_patch_update)
            @_patches_table.on('before-change', => @emit('before-change'))
            @_patch_list = patch_list
            cb()

        ###
        TODO/CRITICAL: We are temporarily disabling same-user collision detection, since this seems to be leading to
        serious issues involving a feedback loop, which may be way worse than the 1 in a million issue
        that this addresses.  This only address the *same* account being used simultaneously on the same file
        by multiple people which isn't something users should ever do (but they do in big demos).

        @_patch_list.on 'overwrite', (t) =>
            # ensure that any outstanding save is done
            @_patches_table.save () =>
                @_check_for_timestamp_collision(t)
        ###

        @_patches_table.on 'saved', (data) =>
            @_handle_offline(data)

    ###
    _check_for_timestamp_collision: (t) =>
        obj = @_my_patches[t]
        if not obj?
            return
        key = @_patches_table.key(obj)
        if obj.patch != @_patches_table.get(key)?.get('patch')
            #console.log("COLLISION! #{t}, #{obj.patch}, #{@_patches_table.get(key).get('patch')}")
            # We fix the collision by finding the nearest time after time that
            # is available, and reinserting our patch at that new time.
            @_my_patches[t] = 'killed'
            new_time = @_patch_list.next_available_time(new Date(t), @_user_id, @_users.length)
            @_save_patch(new_time, JSON.parse(obj.patch))
    ###

    _init_evaluator: (cb) =>
        if misc.filename_extension(@_path) == 'sagews'
            @_evaluator = new Evaluator(@, cb)
        else
            cb()

    _init_cursors: (cb) =>
        if not @_client.is_user()
            # only the users care about cursors.
            cb()
        else
            if not @_opts.cursors
                cb()
                return
            query =
                cursors :
                    string_id : @_string_id
                    user_id   : null
                    locs      : null
                    time      : null
            @_cursors = @_client.sync_table(query, [], @_opts.cursor_interval)
            @_cursors.once 'connected', =>
                # cursors now initialized; first initialize the local @_cursor_map,
                # which tracks positions of cursors by account_id:
                @_cursor_map = immutable.Map()
                @_cursors.get().map (locs, k) =>
                    @_cursor_map = @_cursor_map.set(@_users[JSON.parse(k)?[1]], locs)
                cb()

            # @_other_cursors is an immutable.js map from account_id's
            # to list of cursor positions of *other* users (starts undefined).
            @_cursor_map = undefined

            @_cursors.on 'change', (keys) =>
                if @_closed
                    return
                for k in keys
                    account_id = @_users[JSON.parse(k)?[1]]
                    @_cursor_map = @_cursor_map.set(account_id, @_cursors.get(k))
                    @emit('cursor_activity', account_id)

    # Set this users cursors to the given locs.  This function is
    # throttled, so calling it many times is safe, and all but
    # the last call is discarded.
    # NOTE: no-op if only one user or cursors not enabled for this doc
    set_cursor_locs: (locs, side_effect) =>
        if @_closed
            return
        if @_users.length <= 2
            # Don't bother in special case when only one user (plus the project -- for 2 above!)
            # since we never display the user's
            # own cursors - just other user's cursors.  This simple optimization will save tons
            # of bandwidth, since many files are never opened by more than one user.
            return
        @_throttled_set_cursor_locs?(locs, side_effect)
        return

    # returns immutable.js map from account_id to list of cursor positions, if cursors are enabled.
    get_cursors: =>
        return @_cursor_map

    # set settings map.  (no-op if not yet initialized -- thus DO NOT call until initialized...)
    set_settings: (obj) =>
        @_syncstring_table?.set({string_id:@_string_id, settings:obj})

    # get immutable.js settings object
    get_settings: =>
        return @_syncstring_table?.get_one().get('settings') ? immutable.Map()

    save_asap: (cb) =>
        @_save(cb)

    # save any changes we have as a new patch
    _save: (cb) =>
        #dbg = @dbg('_save'); dbg('saving changes to db')
        if @_closed
            #dbg("string closed -- can't save")
            cb?("string closed")
            return

        if not @_last?
            #dbg("string not initialized -- can't save")
            cb?("string not initialized")
            return

        if @_last.is_equal(@_doc)
            #dbg("nothing changed so nothing to save")
            cb?()
            return

        if @_handle_patch_update_queue_running
            # wait until the update is done, then try again.
            @once '_handle_patch_update_queue_done', =>
                @_save(cb)
            return

        if @_saving
            # this makes it at least safe to call @_save() directly...
            cb?("saving")
            return

        @_saving = true
        @_sync_remote_and_doc (err) =>
            @_saving = false
            cb?(err)

        @snapshot_if_necessary()
        # Emit event since this syncstring was definitely changed locally.
        @emit('user_change')

    _next_patch_time: =>
        time = @_client.server_time()
        min_time = @_patch_list.newest_patch_time()
        if min_time? and min_time >= time
            time = new Date((min_time - 0) + 1)
        time = @_patch_list.next_available_time(time, @_user_id, @_users.length)
        return time

    _undelete: () =>
        if @_closed
            return
        #@dbg("_undelete")()
        @_syncstring_table.set(@_syncstring_table.get_one().set('deleted', false))

    _save_patch: (time, patch, cb) =>  # cb called when save to the backend done
        if @_closed
            cb?('closed')
            return
        obj =  # version for database
            string_id : @_string_id
            time      : time
            patch     : JSON.stringify(patch)
            user_id   : @_user_id

        @_my_patches[time - 0] = obj

        if @_patch_format?
            obj.format = @_patch_format
        if @_deleted
            # file was deleted but now change is being made, so undelete it.
            @_undelete()
        if @_save_patch_prev?
            # timestamp of last saved patch during this session
            obj.prev = @_save_patch_prev
        @_save_patch_prev = time
        #console.log("_save_patch: #{misc.to_json(obj)}")

        # If in undo mode put the just-created patch in our without timestamp list, so it won't be included when doing undo/redo.
        @_undo_state?.without.unshift(time)

        #console.log 'saving patch with time ', time - 0
        x = @_patches_table.set(obj, 'none', cb)
        @_patch_list.add([@_process_patch(x, undefined, undefined, patch)])


    # Save current live string to backend.  It's safe to call this frequently,
    # since it will debounce itself.
    save: (cb) =>
        @_save_debounce ?= {}
        misc.async_debounce
            f        : @_save
            interval : @_save_interval
            state    : @_save_debounce
            cb       : cb
        return

    # Create and store in the database a snapshot of the state
    # of the string at the given point in time.  This should
    # be the time of an existing patch.
    snapshot: (time, force=false) =>
        if not misc.is_date(time)
            throw Error("time must be a date")
        x = @_patch_list.patch(time)
        if not x?
            console.warn("no patch at time #{time}")  # should never happen...
            return
        if x.snapshot? and not force
            # there is already a snapshot at this point in time, so nothing further to do.
            return
        # save the snapshot itself in the patches table.
        obj =
            string_id : @_string_id
            time      : time
            patch     : JSON.stringify(x.patch)
            snapshot  : @_patch_list.value(time, force).to_str()
            user_id   : x.user_id
        if force
            # CRITICAL: We are sending the patch/snapshot later, but it was valid.
            # It's important to make this clear or _handle_offline will
            # recompute this snapshot and try to update sent on it again,
            # which leads to serious problems!
            obj.sent = time
        x.snapshot = obj.snapshot  # also set snapshot in the @_patch_list, which helps with optimization
        @_patches_table.set obj, 'none' , (err) =>
            if not err
                # CRITICAL: Only save the snapshot time in the database after the set in the patches table was confirmed as a
                # success -- otherwise if the user refreshes their browser (or visits later) they lose all their early work!
                @_syncstring_table.set(string_id:@_string_id, project_id:@_project_id, path:@_path, last_snapshot:time)
                @_last_snapshot = time
            else
                console.warn("failed to save snapshot -- #{err}")
        return time

    # Have a snapshot every @_snapshot_interval patches, except
    # for the very last interval.
    snapshot_if_necessary: () =>
        time = @_patch_list.time_of_unmade_periodic_snapshot(@_snapshot_interval)
        if time?
            return @snapshot(time)

    # x - patch object
    # time0, time1: optional range of times; return undefined if patch not in this range
    # patch -- if given will be used as an actual patch instead of x.patch, which is a JSON string.
    _process_patch: (x, time0, time1, patch) =>
        if not x?  # we allow for x itself to not be defined since that simplifies other code
            return
        time    = x.get('time')
        if not misc.is_date(time)
            try
                time = misc.ISO_to_Date(time)
                if isNaN(time)  # ignore patches with bad times
                    return
            catch err
                # ignore patches with invalid times
                return
        user_id = x.get('user_id')
        sent    = x.get('sent')
        prev    = x.get('prev')
        if time0? and time < time0
            return
        if time1? and time > time1
            return
        if not patch?
            # Do **NOT** use misc.from_json, since we definitely do not want to
            # unpack ISO timestamps as Date, since patch just contains the raw
            # patches from user editing.  This was done for a while, which
            # led to horrific bugs in some edge cases...
            # See https://github.com/sagemathinc/cocalc/issues/1771
            patch = JSON.parse(x.get('patch') ? '[]')
        snapshot = x.get('snapshot')
        obj =
            time    : time
            user_id : user_id
            patch   : patch
        if sent?
            obj.sent = sent
        if prev?
            obj.prev = prev
        if snapshot?
            obj.snapshot = snapshot
        return obj

    # return all patches with time such that time0 <= time <= time1;
    # if time0 undefined then sets equal to time of last_snapshot; if time1 undefined treated as +oo
    _get_patches: (time0, time1) =>
        time0 ?= @_last_snapshot
        m = @_patches_table.get()  # immutable.js map with keys the string that is the JSON version of the primary key [string_id, timestamp, user_number].
        v = []
        m.map (x, id) =>
            p = @_process_patch(x, time0, time1)
            if p?
                v.push(p)
        v.sort(patch_cmp)
        return v

    has_full_history: () =>
        return not @_last_snapshot or @_load_full_history_done

    load_full_history: (cb) =>
        #dbg = @dbg("load_full_history")
        #dbg()
        if @has_full_history()
            #dbg("nothing to do, since complete history definitely already loaded")
            cb?()
            return
        query = @_patch_table_query()
        @_client.query
            query : {patches:[query]}
            cb    : (err, result) =>
                if err
                    cb?(err)
                else
                    v = []
                    # _process_patch assumes immutable.js objects
                    immutable.fromJS(result.query.patches).forEach (x) =>
                        p = @_process_patch(x, 0, @_last_snapshot)
                        if p?
                            v.push(p)
                    @_patch_list.add(v)
                    @_load_full_history_done = true
                    cb?()

    show_history: (opts) =>
        @_patch_list.show_history(opts)

    get_path: =>
        return @_path

    get_project_id: =>
        return @_project_id

    set_snapshot_interval: (n) =>
        @_syncstring_table.set(@_syncstring_table.get_one().set('snapshot_interval', n))
        return

    # Check if any patches that just got confirmed as saved are relatively old; if so,
    # we mark them as such and also possibly recompute snapshots.
    _handle_offline: (data) =>
        #dbg = @dbg("_handle_offline")
        #dbg("data='#{misc.to_json(data)}'")
        if @_closed
            return
        now = misc.server_time()
        oldest = undefined
        for obj in data
            if obj.sent
                # CRITICAL: ignore anything already processed! (otherwise, infinite loop)
                continue
            if now - obj.time >= 1000*OFFLINE_THRESH_S
                # patch is "old" -- mark it as likely being sent as a result of being
                # offline, so clients could potentially discard it.
                obj.sent = now
                @_patches_table.set(obj)
                if not oldest? or obj.time < oldest
                    oldest = obj.time
        if oldest
            #dbg("oldest=#{oldest}, so check whether any snapshots need to be recomputed")
            for snapshot_time in @_patch_list.snapshot_times()
                if snapshot_time - oldest >= 0
                    #console.log("recomputing snapshot #{snapshot_time}")
                    @snapshot(snapshot_time, true)

    _handle_syncstring_save_state: (state, time) =>
        # This is used to make it possible to emit a
        # 'save-to-disk' event, whenever the state changes
        # to indicate a save completed.

        # NOTE: it is intentional that @_syncstring_save_state is not defined
        # the first tie this function is called, so that save-to-disk
        # with last save time gets emitted on initial load (which, e.g., triggers
        # latex compilation properly in case of a .tex file).
        if state == 'done' and @_syncstring_save_state != 'done'
            @emit('save-to-disk', time)
        @_syncstring_save_state = state

    _handle_syncstring_update: () =>
        #dbg = @dbg("_handle_syncstring_update")
        #dbg()
        if not @_syncstring_table? # not initialized; nothing to do
            #dbg("nothing to do")
            return

        data = @_syncstring_table.get_one()
        x = data?.toJS()

        @_handle_syncstring_save_state(x?.save?.state, x?.save?.time)

        #dbg(JSON.stringify(x))
        # TODO: potential races, but it will (or should!?) get instantly fixed when we get an update in case of a race (?)
        client_id = @_client.client_id()
        # Below " not x.snapshot? or not x.users?" is because the initial touch sets
        # only string_id and last_active, and nothing else.
        if not x? or not x.users?
            # Brand new document
            @emit('load-time-estimate', {type:'new', time:1})
            @_last_snapshot = undefined
            @_snapshot_interval = schema.SCHEMA.syncstrings.user_query.get.fields.snapshot_interval
            # brand new syncstring
            @_user_id = 0
            @_users = [client_id]
            obj =
                string_id     : @_string_id
                project_id    : @_project_id
                path          : @_path
                last_snapshot : @_last_snapshot
                users         : @_users
                deleted       : @_deleted
                doctype       : misc.to_json(@_doctype)
            @_syncstring_table.set(obj)
            @_settings = immutable.Map()
            @emit('metadata-change')
            @emit("settings-change", @_settings)
        else
            # Existing document.
            if x.archived
                @emit('load-time-estimate', {type:'archived', time:8})
            else
                @emit('load-time-estimate', {type:'ready', time:2})

            # TODO: handle doctype change here (?)
            @_last_snapshot     = x.last_snapshot
            @_snapshot_interval = x.snapshot_interval
            @_users             = x.users
            @_project_id        = x.project_id
            @_path              = x.path

            settings = data.get('settings', immutable.Map())
            if settings != @_settings
                @emit("settings-change", settings)
                @_settings = settings

            if @_deleted? and x.deleted and not @_deleted # change to deleted
                @emit("deleted")
            @_deleted           = x.deleted

            # Ensure that this client is in the list of clients
            @_user_id = @_users?.indexOf(client_id)
            if @_user_id == -1
                @_user_id = @_users.length
                @_users.push(client_id)
                @_syncstring_table.set({string_id:@_string_id, project_id:@_project_id, path:@_path, users:@_users})

            if not @_client.is_project()
                @emit('metadata-change')
                return

            #dbg = @dbg("_handle_syncstring_update('#{@_path}')")
            #dbg("project only handling")
            # Only done for project:
            async.series([
                (cb) =>
                    if @_patch_list?
                        #dbg("patch list already loaded")
                        cb()
                    else
                        #dbg("wait for patch list to load...")
                        @once 'connected', =>
                            #dbg("patch list loaded")
                            cb()
                (cb) =>
                    # NOTE: very important to completely do @_update_watch_path
                    # before @_save_to_disk below.
                    # If client is a project and path isn't being properly watched, make it so.
                    if x.project_id? and @_watch_path != x.path
                        #dbg("watch path")
                        @_update_watch_path(x.path, cb)
                    else
                        cb()
                (cb) =>
                    if x.save?.state == 'requested'
                        #dbg("save to disk")
                        @_save_to_disk(cb)
                    else
                        cb()
            ], (err) =>
                if err
                    @dbg("_handle_syncstring_update")("POSSIBLY UNHANDLED ERROR -- #{err}")
                @emit('metadata-change')
            )


    _update_watch_path: (path, cb) =>
        dbg = @_client.dbg("_update_watch_path('#{path}')")
        if @_file_watcher?
            # clean up
            dbg("close")
            @_file_watcher.close()
            delete @_file_watcher
            delete @_watch_path
        if not path?
            dbg("not opening another watcher")
            cb?()
            return
        if @_watch_path?
            dbg("watch_path already defined")
            cb?()
            return
        dbg("opening watcher")
        @_watch_path = path
        async.series([
            (cb) =>
                @_client.path_exists
                    path : path
                    cb   : (err, exists) =>
                        if err
                            cb(err)
                        else if not exists
                            dbg("write '#{path}' to disk from syncstring in-memory database version")
                            data = @to_str() ? ''  # maybe in case of no patches yet (?).
                            @_client.write_file
                                path : path
                                data : data
                                cb   : (err) =>
                                    dbg("wrote '#{path}' to disk -- now calling cb")
                                    cb(err)
                        else
                            cb()
            (cb) =>
                dbg("now requesting to watch file")
                @_file_watcher = @_client.watch_file(path:path)
                @_file_watcher.on 'change', (ctime) =>
                    ctime ?= new Date()
                    ctime = ctime - 0
                    dbg("file_watcher: change, ctime=#{ctime}, @_save_to_disk_start_ctime=#{@_save_to_disk_start_ctime}, @_save_to_disk_end_ctime=#{@_save_to_disk_end_ctime}")
                    if @_closed
                        @_file_watcher.close()
                        return
                    if ctime - (@_save_to_disk_start_ctime ? 0) >= 7*1000
                        # last attempt to save was at least 7s ago, so definitely
                        # this change event was not caused by it.
                        dbg("_load_from_disk: no recent save")
                        @_load_from_disk()
                        return
                    if not @_save_to_disk_end_ctime?
                        # save event started less than 15s and isn't done.
                        # ignore this load.
                        dbg("_load_from_disk: unfinished @_save_to_disk just happened, so ignoring file change")
                        return
                    if @_save_to_disk_start_ctime <= ctime and ctime <= @_save_to_disk_end_ctime
                        # changed triggered during the save
                        dbg("_load_from_disk: change happened during @_save_to_disk, so ignoring file change")
                        return
                    # Changed happened near to when there was a save, but not in window, so
                    # we do it..
                    dbg("_load_from_disk: happened to close to recent save, so ignoring")
                    return

                @_file_watcher.on 'delete', =>
                    dbg("event delete")
                    if @_closed
                        @_file_watcher.close()
                        return
                    dbg("delete: setting deleted=true and closing")
                    @from_str('')
                    @save () =>
                        # NOTE: setting deleted=true must be done **after** setting document to blank above,
                        # since otherwise the set would set deleted=false.
                        @_syncstring_table.set(@_syncstring_table.get_one().set('deleted', true))
                        @_syncstring_table.save () =>  # make sure deleted:true is saved.
                            @close()
                    return
                cb()
        ], (err) => cb?(err))

    _load_from_disk: (cb) =>   # cb(err, size)
        path = @get_path()
        dbg = @_client.dbg("syncstring._load_from_disk('#{path}')")
        dbg()
        if @_load_from_disk_lock
            cb?('lock')
            return
        @_load_from_disk_lock = true
        locals = {exists: undefined, size:0}
        async.series([
            (cb) =>
                @_client.path_exists
                    path : path
                    cb   : (err, exists) =>
                        locals.exists = exists
                        if not exists
                            dbg("file no longer exists")
                            @from_str('')
                        cb(err)
            (cb) =>
                if locals.exists
                    @_update_if_file_is_read_only(cb)
                else
                    cb()
            (cb) =>
                if not locals.exists
                    cb()
                    return
                @_client.path_read
                    path       : path
                    maxsize_MB : MAX_FILE_SIZE_MB
                    cb         : (err, data) =>
                        if err
                            dbg("failed -- #{err}")
                            cb(err)
                        else
                            locals.size = data?.length ? 0
                            dbg("got it -- length=#{locals.size}")
                            @from_str(data)
                            # we also know that this is the version on disk, so we update the hash
                            @_set_save(state:'done', error:false, hash:misc.hash_string(data))
                            cb()
            (cb) =>
                # save back to database
                @_save(cb)
        ], (err) =>
            @_load_from_disk_lock = false
            cb?(err, locals.size)
        )

    _set_save: (x) =>
        if @_closed # nothing to do
            return
        # set timestamp of when the save happened; this can be useful for coordinating
        # running code, etc.... and is just generally useful.
        x.time = new Date() - 0
        @_syncstring_table?.set?(@_syncstring_table.get_one()?.set('save', immutable.fromJS(x)))
        return

    _set_read_only: (read_only) =>
        if @_closed # nothing to do
            return
        @_syncstring_table?.set?(@_syncstring_table.get_one()?.set('read_only', read_only))
        return

    get_read_only: () =>
        if @_closed # nothing to do
            return
        return @_syncstring_table?.get_one()?.get('read_only')

    # This should only be called after the syncstring is initialized (hence connected), since
    # otherwise @_syncstring_table isn't defined yet (it gets defined during connect).
    wait_until_read_only_known: (cb) =>
        if @_closed
            cb("syncstring is closed")
            return
        if not @_syncstring_table?
            # should never happen
            cb("@_syncstring_table must be defined")
            return
        @_syncstring_table.wait
            until : (t) => t.get_one()?.get('read_only')?
            cb    : cb

    # Returns true if the current live version of this document has a different hash
    # than the version mostly recently saved to disk.  I.e., if there are changes
    # that have not yet been **saved to disk**.  See the other function
    # has_uncommitted_changes below for determining whether there are changes
    # that haven't been commited to the database yet.
    # Returns *undefined* if initialization not even done yet.
    has_unsaved_changes: =>
        hash_saved = @hash_of_saved_version()
        hash_live  = @hash_of_live_version()
        if not hash_saved? or not hash_live? # don't know yet...
            return
        return hash_live != hash_saved

    # Returns hash of last version saved to disk (as far as we know).
    hash_of_saved_version: =>
        table = @_syncstring_table?.get_one()
        if not table?
            return
        return table.getIn(['save', 'hash']) ? 0   # known, but not saved ever.

    # Return hash of the live version of the document, or undefined if the document
    # isn't loaded yet.  (TODO: faster version of this for syncdb, which avoids
    # converting to a string, which is a waste of time.)
    hash_of_live_version: =>
        s = @_doc?.to_str?()
        if s?
            return misc.hash_string(s)

    # Initiates a save of file to disk, then if cb is set, waits for the state to
    # change to done before calling cb.
    save_to_disk: (cb) =>
        #dbg = @dbg("save_to_disk(cb)")
        #dbg("initiating the save")
        if not @has_unsaved_changes()
            # no unsaved changes, so don't save --
            # CRITICAL: this optimization is assumed by autosave, etc.
            cb?()
            return

        if @get_read_only()
            # save should fail if file is read only
            cb?('readonly')
            return

        if @_deleted
            # nothing to do -- no need to attempt to save if file is already deleted
            cb?()
            return

        # First make sure any changes are saved to the database.
        # One subtle case where this matters is that loading a file
        # with \r's into codemirror changes them to \n...
        @save (err) =>
            if err
                cb?(err)
            else
                # Now do actual save to the *disk*.
                @__save_to_disk_after_sync(cb)

    __save_to_disk_after_sync: (cb) =>
        @_save_to_disk()
        if not @_syncstring_table?
            cb("@_syncstring_table must be defined")
            return
        if cb?
            #dbg("waiting for save.state to change from '#{@_syncstring_table.get_one().getIn(['save','state'])}' to 'done'")
            f = (cb) =>
                if @_closed
                    # closed during save
                    cb()
                    return
                if @_deleted
                    # if deleted, then save doesn't need to finish and is done successfully.
                    cb()
                    return
                if not @_syncstring_table?
                    cb(true)
                    return
                @_syncstring_table.wait
                    until   : (table) -> table.get_one()?.getIn(['save','state']) == 'done'
                    timeout : 10
                    cb      : (err) =>
                        #dbg("done waiting -- now save.state is '#{@_syncstring_table.get_one().getIn(['save','state'])}'")
                        if err
                            #dbg("got err waiting: #{err}")
                        else
                            # ? because @_syncstring_table could be undefined here, if saving and closing at the same time.
                            err = @_syncstring_table?.get_one().getIn(['save', 'error'])
                            #if err
                            #    dbg("got result but there was an error: #{err}")
                        if err
                            @touch(0) # touch immediately to ensure backend pays attention.
                        cb(err)
            misc.retry_until_success
                f         : f
                max_tries : 4
                cb        : (err, last_err) =>
                    if @_closed
                        # closed during save
                        cb()
                        return
                    if last_err
                        @_client.log_error?({string_id:@_string_id, path:@_path, project_id:@_project_id, error:"Error saving file -- #{last_err}"})
                    cb(last_err)

    # Save this file to disk, if it is associated with a project and has a filename.
    # A user (web browsers) sets the save state to requested.
    # The project sets the state to saving, does the save to disk, then sets
    # the state to done.
    _save_to_disk: (cb) =>
        if @_client.is_user()
            @__save_to_disk_user()
            cb?()
            return

        if @_saving_to_disk_cbs?
            @_saving_to_disk_cbs.push(cb)
            return
        else
            @_saving_to_disk_cbs = [cb]

        @__do_save_to_disk_project (err) =>
            v = @_saving_to_disk_cbs
            delete @_saving_to_disk_cbs
            for cb in v
                cb?(err)
            @emit("save_to_disk_project", err)

    __save_to_disk_user: =>
        if @_closed # nothing to do
            return
        if not @has_unsaved_changes()
            # Browser client that has no unsaved changes, so don't need to save --
            # CRITICAL: this optimization is assumed by autosave, etc.
            return
        # CRITICAL: First, we broadcast interest in the syncstring -- this will cause the relevant project
        # (if it is running) to open the syncstring (if closed), and hence be aware that the client
        # is requesting a save.  This is important if the client and database have changes not
        # saved to disk, and the project stopped listening for activity on this syncstring due
        # to it not being touched (due to active editing).  Not having this leads to a lot of "can't save"
        # errors.
        @touch()
        data = @to_str()  # string version of this doc
        expected_hash = misc.hash_string(data)
        @_set_save(state:'requested', error:false, expected_hash:expected_hash)

    __do_save_to_disk_project: (cb) =>
        # check if on-disk version is same as in memory, in which case no save is needed.
        data = @to_str()  # string version of this doc
        hash = misc.hash_string(data)
        expected_hash = @_syncstring_table.get_one().getIn(['save', 'expected_hash'])
        if failing_to_save(@_path, hash, expected_hash)
            @dbg("__save_to_disk_project")("FAILING TO SAVE-- hash=#{hash}, expected_hash=#{expected_hash} -- reconnecting")
            cb('failing to save -- reconnecting')
            @reconnect()
            return
        if hash == @hash_of_saved_version()
            # No actual save to disk needed; still we better record this fact in table in case it
            # isn't already recorded
            @_set_save(state:'done', error:false, hash:hash)
            cb()
            return

        path = @get_path()
        #dbg = @dbg("__do_save_to_disk_project('#{path}')")
        if not path?
            cb("not yet initialized")
            return
        if not path
            @_set_save(state:'done', error:'cannot save without path')
            cb("cannot save without path")
            return

        #dbg("project - write to disk file")
        # set window to slightly earlier to account for clock imprecision.
        # Over an sshfs mount, all stats info is **rounded down to the nearest second**,
        # which this also takes care of.
        @_save_to_disk_start_ctime = new Date() - 1500
        @_save_to_disk_end_ctime = undefined
        async.series([
            (cb) =>
                @_client.write_file
                    path : path
                    data : data
                    cb   : cb
            (cb) =>
                @_client.path_stat
                    path : path
                    cb   : (err, stat) =>
                        @_save_to_disk_end_ctime = stat?.ctime - 0
                        cb(err)
        ], (err) =>
            #dbg("returned from write_file: #{err}")
            if err
                @_set_save(state:'done', error:JSON.stringify(err))
            else
                @_set_save(state:'done', error:false, hash:misc.hash_string(data))
            cb(err)
        )

    ###
    When the underlying synctable that defines the state of the document changes
    due to new remote patches, this function is called.
    It handles update of the remote version, updating our live version as a result.
    ###
    _handle_patch_update: (changed_keys) =>
        if @_closed
            return
        #console.log("_handle_patch_update #{misc.to_json(changed_keys)}")
        if not changed_keys? or changed_keys.length == 0
            # this happens right now when we do a save.
            return
        if not @_patch_list?
            # nothing to do
            return
        #dbg = @dbg("_handle_patch_update")
        #dbg(new Date(), changed_keys)
        @_patch_update_queue ?= []
        for key in changed_keys
            @_patch_update_queue.push(key)
        if @_handle_patch_update_queue_running
            return
        setTimeout(@_handle_patch_update_queue, 1)

    _handle_patch_update_queue: =>
        if @_closed or not @_patches_table?  # https://github.com/sagemathinc/cocalc/issues/2829
            return
        @_handle_patch_update_queue_running = true

        # note: other code handles that @_patches_table.get(key) may not be
        # defined, e.g., when changed means "deleted"
        v = (@_patches_table.get(key) for key in @_patch_update_queue)
        @_patch_update_queue = []
        v = (x for x in v when x? and not @_my_patches?[x.get('time') - 0])
        if v.length > 0
            @_patch_list.add( (@_process_patch(x) for x in v) )
            # NOTE: This next line can sometimes *cause* new entries to be added to @_patch_update_queue.
            @_sync_remote_and_doc()

        if @_patch_update_queue.length > 0
            # It is very important that this happen in the next
            # render loop to avoid the @_sync_remote_and_doc call
            # in @_handle_patch_update_queue from causing
            # _sync_remote_and_doc to get called from within itself,
            # due to synctable changes being emited on save.
            setTimeout(@_handle_patch_update_queue, 1)
        else
            # OK, done and nothing in the queue
            @_handle_patch_update_queue_running = false
            # Notify _save to try again.
            @emit('_handle_patch_update_queue_done')

    ###
    Merge remote patches and live version to create new live version,
    which is equal to result of applying all patches.

    This is completely synchronous, and calls before_change_hook and after_change_hook,
    if given, so will work with live being "isomorphic" to some editor (like codemirror).
    ###
    _sync_remote_and_doc: (cb) =>  # optional cb only used to know when save_patch is done
        if not @_last? or not @_doc?
            cb?()
            return
        if @_sync_remote_and_doc_calling
            throw Error("bug - _sync_remote_and_doc can't be called twice at once")
        @_sync_remote_and_doc_calling = true
        # ensure that our live @_doc equals what the user's editor shows in their browser (say)
        @_before_change_hook?()
        # NOTE/WARNING: this code right here (and this function) *MIGHT BE* wrong in edge cases
        # that can be hit with rapid changes (e.g., sage worksheets) -- see the fixed
        # code in sync-doc.ts.  I'm not sure...  The problem may be much harder to hit
        # since things are so throttled in this code...
        if not @_last.is_equal(@_doc)
            # compute transformation from _last to _doc
            patch = @_last.make_patch(@_doc) # must be nontrivial
            # ... and save that to patch table since there is a nontrivial change
            time = @_next_patch_time()
            @_save_patch(time, patch, cb)
            @_last = @_doc
        else
            cb?()

        new_remote = @_patch_list.value()
        if not @_doc.is_equal(new_remote)
            # if any possibility that document changed, set to new version
            @_last = @_doc = new_remote
            @_after_change_hook?()
            @emit('change')
        @_sync_remote_and_doc_calling = false

    # Return true if there are changes to this syncstring that have not been
    # committed to the database (with the commit acknowledged).  This does not
    # mean the file has been written to disk; however, it does mean that it
    # safe for the user to close their browser.
    # Returns undefined if not yet initialized.
    has_uncommitted_changes: () =>
        return @_patches_table?.has_uncommitted_changes()

exports.SyncDoc = SyncDoc

# Immutable string document that satisfies our spec.
class StringDocument
    constructor: (@_value='') ->

    to_str: =>
        return @_value

    is_equal: (other) =>
        return @_value == other?._value

    apply_patch: (patch) =>
        return new StringDocument(apply_patch(patch, @_value)[0])

    make_patch: (other) =>
        if not @_value? or not other?._value?
            # document not inialized or other not meaningful
            return
        return make_patch(@_value, other._value)

exports._testStringDocument = StringDocument

class exports.SyncString extends SyncDoc
    constructor: (opts) ->
        opts = defaults opts,
            id                : undefined
            client            : required
            project_id        : undefined
            path              : undefined
            save_interval     : undefined
            patch_interval    : undefined
            file_use_interval : undefined
            cursors           : false      # if true, also provide cursor tracking ability
            before_change_hook: undefined
            after_change_hook : undefined

        from_str = (str) ->
            new StringDocument(str)

        super
            string_id          : opts.id
            client             : opts.client
            project_id         : opts.project_id
            path               : opts.path
            save_interval      : opts.save_interval
            patch_interval     : opts.patch_interval
            file_use_interval  : opts.file_use_interval
            cursors            : opts.cursors
            from_str           : from_str
            doctype            : {type:'string'}
            before_change_hook : opts.before_change_hook
            after_change_hook  : opts.after_change_hook

###
Used for testing
###
synctable = require('./synctable')
class exports.TestBrowserClient1 extends synctable.TestBrowserClient1
    constructor: (_client_id, _debounce_interval=0) ->
        super()
        @_client_id = _client_id
        @_debounce_interval = _debounce_interval

    is_user: =>
        return true

    mark_file: =>

    server_time: =>
        return new Date()

    sync_table: (query, options, debounce_interval=0) =>
        debounce_interval = @_debounce_interval # hard coded for testing
        return synctable.sync_table(query, options, @, debounce_interval, 0, false)

    sync_string: (opts) =>
        opts = defaults opts,
            id                : undefined
            project_id        : undefined
            path              : undefined
            file_use_interval : 'default'
            cursors           : false
            save_interval     : 0
        opts.client = @
        return new exports.SyncString(opts)

    client_id: =>
        return @_client_id
