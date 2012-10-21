message = require("salvus_message")

sjsc = require("sockjs-client-ws")  #  https://github.com/steerapi/sockjs-client-node

#client = sjsc.create("https://localhost/node")  # doesn't work -- don't know why
client = sjsc.create("http://localhost:5000/node")

walltime = -> (new Date()).getTime()
tm = 0
n = 0

client.on('connection', ->
    console.log("connection established")
    tm = walltime()
    client.write(JSON.stringify(message.execute_code(0,'2+2')))
    )

client.on('data', (msg) ->
    t = walltime() - tm
    n = n + 1
    console.log("#{n}: #{Math.floor(n/t*1000)} tps, #{t} ms -- received some data #{msg}")
    if n == 100
        n = 0
        tm = walltime() # start over
    if JSON.parse(msg).done
        console.log("sending 2+2...")
        client.write(JSON.stringify(message.execute_code(n,'2+2')))
)

client.on('error', (e) -> console.log("something went wrong #{e}"))


