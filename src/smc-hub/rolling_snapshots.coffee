###
Create rolling snapshots of a given ZFS volume

    parser_snapshot = subparsers.add_parser('snapshot', help='create/trim the snapshots for btrfs-based storage')
    parser_snapshot.add_argument("--five", help="number of five-minute snapshots to retain", default=12*6, type=int)
    parser_snapshot.add_argument("--hourly", help="number of hourly snapshots to retain", default=24*7, type=int)
    parser_snapshot.add_argument("--daily", help="number of daily snapshots to retain", default=30, type=int)
    parser_snapshot.add_argument("--weekly", help="number of weekly snapshots to retain", default=20, type=int)
    parser_snapshot.add_argument("--monthly", help="number of monthly snapshots to retain", default=12, type=int)
    parser_snapshot.set_defaults(func=lambda args:snapshot(five=args.five, hourly=args.hourly,
                                           daily=args.daily, weekly=args.weekly, monthly=args.monthly, mnt=args.btrfs))


def snapshot(five, hourly, daily, weekly, monthly, mnt):
    log("snapshot")
    snapdir = os.path.join(mnt, '.snapshots')
    # get list of all snapshots
    snapshots = cmd(['ls', snapdir], verbose=0).splitlines()
    snapshots.sort()
    # create missing snapshots
    now = time.time() # time in seconds since epoch
    for name, interval in [('five',5), ('hourly',60), ('daily',60*24), ('weekly',60*24*7), ('monthly',60*24*7*4)]:
        # Is there a snapshot with the given name that is within the given
        # interval of now?  If not, make snapshot.
        v = [s for s in snapshots if s.endswith('-'+name)]
        if len(v) == 0:
            age = 9999999999 #infinite
        else:
            newest = v[-1]
            n = len('2015-05-03-081013')
            t = time.mktime(time.strptime(newest[:n], TIMESTAMP_FORMAT))
            age = (now - t)/60.  # age in minutes since snapshot
        if age > interval:
            # make the snapshot
            snapname = "%s-%s"%(time.strftime(TIMESTAMP_FORMAT), name)
            target = os.path.join(snapdir, snapname)
            log('creating snapshot %s', target)
            btrfs(['subvolume', 'snapshot', '-r', mnt, target])
            v.append(snapname)
        max_snaps = locals()[name]
        if len(v) > max_snaps:
            # delete out-dated snapshots
            for i in range(len(v) - max_snaps):
                target = os.path.join(snapdir, v[i])
                log("deleting snapshot %s", target)
                btrfs(['subvolume', 'delete', target])
###

async       = require('async')
winston     = require('winston')

misc_node = require('smc-util-node/misc_node')
misc      = require('smc-util/misc')
{defaults, required} = misc

list_snapshots = (filesystem, cb) ->
    misc_node.execute_code
        command : 'sudo'
        args    : ['zfs', 'list', '-r', '-H', '-t', 'snapshot', filesystem]
        cb      : (err, output) ->
            if err
                cb(err)
            else
                snapshots = (misc.split(x)[0].split('@')[1] for x in output.stdout.split('\n') when x.trim())
                snapshots.sort()
                cb(undefined, snapshots)

make_snapshot = (filesystem, snap, cb) ->
    misc_node.execute_code
        command : 'sudo'
        args    : ['zfs', 'snapshot', "#{filesystem}@#{snap}"]
        cb      : cb

delete_snapshot = (filesystem, snap, cb) ->
    misc_node.execute_code
        command : 'sudo'
        args    : ['zfs', 'destroy', "#{filesystem}@#{snap}"]
        cb      : cb

INTERVALS =
    five    : 5
    hourly  : 60
    daily   : 60*24
    weekly  : 60*24*7
    monthly : 60*24*7*4

exports.update_snapshots = (opts) ->
    opts = defaults opts,
        filesystem : required
        five       : 12*10  # number of five-minute snapshots to retain
        hourly     : 24*7   # ...
        daily      : 30
        weekly     : 20
        monthly    : 12
        cb         : undefined
    dbg = (m) -> winston.debug("snapshot: #{m}")
    dbg()
    snapshots = undefined
    async.series([
        (cb) ->
            dbg("get list of all snapshots")
            list_snapshots opts.filesystem, (err, x) ->
                snapshots = x; cb(err)
        (cb) ->
            dbg("got snapshots: #{misc.to_json(snapshots)}")
            # determine which snapshots we need to make
            todo = []
            now = new Date()
            for name, interval of INTERVALS
                # Is there a snapshot with the given name that is within the given
                # interval of now?  If not, make snapshot.
                v = (s for s in snapshots when misc.endswith(s, '-'+name))
                if v.length > 0
                    newest = v[v.length-1]
                    t = misc.parse_bup_timestamp(newest)
                    age_m = (now - t)/(60*1000)   # age in minutes since snapshot
                else
                    age_m = 999999999999  # 'infinite'
                if age_m > interval
                    # will make this snapshot
                    todo.push("#{misc.to_iso_path(now)}-#{name}")
            dbg("snapshots to make: #{todo}")
            if todo.length > 0
                f = (snap, cb) ->
                    make_snapshot(opts.filesystem, snap, cb)
                async.map(todo, f, cb)
            else
                cb()
    ], (err) -> opts.cb?(err))
