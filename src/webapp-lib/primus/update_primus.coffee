fs   = require('fs')
path = require('path')

path_to_base_url = path.join(process.env['SMC_ROOT'], 'data', 'base_url')
libname = 'primus-engine.js'
BASE_URL = if fs.existsSync(path_to_base_url) then fs.readFileSync(path_to_base_url).toString().trim() else ''

opts = {pathname : path.join(BASE_URL, '/hub')}

console.log("Building '#{libname}' with opts:", opts)

Primus = require('primus')
http = require('http')
server = http.createServer()
primus = new Primus(server, opts)
fs.writeFileSync(libname, primus.library())
process.exit()
