fs = require('fs')
primus = new require('primus')(require('http').createServer(), {transformer: 'engine.io',  pathname : '/hub'}); fs.writeFileSync('primus-engine.js',primus.library());
