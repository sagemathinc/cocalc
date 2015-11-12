### 

Ping a collection of hosts in parallel using raw sockets (for optimal efficiency) outputing a JSON mapping from hostname
to ms ping time.

To use this, you need to do this as root to the node binary

    setcap cap_net_raw,cap_net_admin=eip  <path/to/node/binary>

Use it like this:

    ~/salvus/salvus/scripts$ pingall 10.1.1.1 10.1.2.1
    [{"host":52},{"host":52}]

###

pingall = (hosts, cb) ->    
    session = (require("net-ping")).createSession()
    f = (host, cb) ->
        t = (new Date()).getTime()
        session.pingHost host, (err) -> 
            cb(undefined, [host,if err then -1 else (new Date()).getTime()-t] )
    require('async').map hosts, f, (err, v) -> 
        x = {}
        for a in v
            x[a[0]] = a[1]
        cb(x)

pingall(process.argv.slice(4), (e)->console.log(JSON.stringify(e)))

