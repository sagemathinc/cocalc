fs   = require('fs')
path = require('path')
program = require('commander')

update = (base_url) ->
    opts =
        transformer : 'engine.io'
        pathname    : path.join(base_url, '/hub')

    console.log(opts)

    primus = new require('primus')(require('http').createServer(), opts)

    fs.writeFileSync('primus-engine.js', primus.library())



program.usage('[options]')
    .option('--base_url [string]', 'Base url, so https://sitenamebase_url/', String, '')  # '' or string that starts with /
    .parse(process.argv)

update(program.base_url)