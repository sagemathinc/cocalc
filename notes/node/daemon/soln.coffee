###
# https://npmjs.org/package/start-stop-daemon
# 
#   coffee -c soln.coffee; node soln.js start -p 2000
# 
###

program = require("commander")
daemon = require("start-stop-daemon")
http = require("http")
winston = require('winston')

winston.add(winston.transports.File, { filename: 'winston.log' })

program.option("-p, --port <n>", "port to listen on", parseInt, 1095).parse process.argv

daemon({pidFile:'pid', outFile:'out', errFile:'err'}, ->
  console.log ("Serving on #{program.port}")
  winston.info("Serving on #{program.port}")
  http.createServer((req, res) ->
    console.log (req.connection.remoteAddress + " accessed " + req.url)
    if req.url is "/error"
        throw (new Error("to crash server")) 
    res.end("Hello world! Thanks for accessing " + req.url)
  ).listen (program.port)
).on("restart", -> @stdout.write ("Restarting at " + new Date() + "\n"))