rl = require 'readline'
cli = rl.createInterface process.stdin, process.stdout, null
cli.setPrompt "hello> "

cli.on 'line', (line) ->
  console.log line
  cli.prompt()

cli.prompt()
