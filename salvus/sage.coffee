net = require('net')

class Message
    start_session: (max_walltime=3600, max_cputime=3600, max_numfiles=1000, max_vmem=2048) -> 
        {
            event:'start_session',
            max_walltime:max_walltime,
            max_cputime:max_cputime,
            max_numfiles:max_numfiles,
            max_vmem:max_vmem,
        }
        
    session_description: (pid) ->
        {
            event:'session_description',
            pid:pid,
        }

    send_signal: (pid, signal=2) -> # 2=SIGINT
        {
            event:'send_signal',
            pid:pid,
            signal:signal
        }
    terminate_session: ->
        {
            event:'terminate_session',
        }
    execute_code: (id, code, preparse=true) ->
        {
            event:'execute_code',
            code:code,
            preparse:preparse,
            id:id
        }
    output: (id, stdout=null, stderr=null, done=null) ->
        {
            event:'output',
            id:id,
            stdout:stdout,
            stderr:stderr,
            done:done
        }

message = new Message()            

class Connection
    constructor: (@host, @port, @recv, cb) ->
        @conn = net.connect({port:port, host:host}, cb)

        @buf = null
        @buf_target_length = -1
        @conn.on('data', (data) =>
            # 1. read any new data into buf
            if @buf == null
                @buf = data   # first time to ever recv data, so initialize buffer
            else
                @buf = Buffer.concat([@buf, data])   # extend buf with new data

            loop
                # 2. Starting to read a new message...?
                if @buf_target_length == -1
                    if @buf.length >= 4
                        @buf_target_length = @buf.readUInt32BE(0) + 4
                    else
                        return  # have to wait for more data
                # 3. Read a new message from our buffer?
                if @buf_target_length <= @buf.length
                    @recv(@buf.slice(4, @buf_target_length))
                    @buf = @buf.slice(@buf_target_length)
                    @buf_target_length = -1
                else  # nothing to do but wait for more data
                    return
        )
        
        @conn.on('end', -> console.log("disconnected from sage server"))
        
    send: (mesg) ->
        s = JSON.stringify(mesg)
        buf = new Buffer(4)
        buf.writeInt32BE(s.length, 0)
        @conn.write(buf)
        @conn.write(s)



cb = () ->         
    conn.send(message.start_session())
    for i in [1..10]
        conn.send(message.execute_code(0,"factor(2012)"))

tm = (new Date()).getTime()
conn = new Connection('localhost', 10000,
    (mesg) -> console.log("received message #{mesg}; #{(new Date()).getTime()-tm}"),
    cb
)




#client = net.connect({port:10000, host:'localhost'}, ->
#    console.log("connected to sage server")
#    conn = new Connection(client)
#    mesg = message.start_session()
#    conn.send(mesg)
#    console.log(mesg)
#    s = JSON.stringify(mesg)
#    buf = new Buffer(4)
#    buf.writeInt32BE(s.length,0)
#    client.write(buf)
#    client.write(s)
#    )

 