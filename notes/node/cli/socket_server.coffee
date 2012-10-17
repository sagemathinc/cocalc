#!/usr/bin/env coffee

program = require('commander')   # npm install commander

program
    .option('-p, --port <n>', 'port to listen on', parseInt, 0)
    .option('-t, --tcp_port <n>', 'tcp port to listen on from other tornado servers', parseInt, 0)
    .option('-l, --log_level [level]', "log level (default: INFO) useful options include WARNING and DEBUG", String, "INFO")
    .option('-g, --debug [bool]', 'debug mode (default: false)', Boolean, false)
    .option('-d, --daemon [bool]', 'daemon mode (default: false)', Boolean, false)
    .option('--address [string]', 'address of interface to bind to (default: "")', String, "")
    .option('--pidfile [string]', 'store pid in this file (default: "socket_server.pid")', String, "socket_server.pid")
    .option('--logfile [string]', 'write log to this file (default: "" -- do not log to a file)', String, "")
    .option('--database_nodes <string,string,...>', 'list of ip addresses of all database nodes in the cluster (required)', String)
    .parse(process.argv)

console.log(program.port, program.tcp_port, program.log_level, program.debug, program.daemon, program.address, program.pidfile, program.logfile, program.database_nodes)

