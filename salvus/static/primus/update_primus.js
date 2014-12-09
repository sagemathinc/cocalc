fs = require('fs')
primus = new require('primus')(require('http').createServer(), {transformer: 'websockets',  pathname : '/hub'}); fs.writeFileSync('static/primus/primus-websockets.js',primus.library());
primus = new require('primus')(require('http').createServer(), {transformer: 'engine.io',  pathname : '/hub'}); fs.writeFileSync('static/primus/primus-engine.js',primus.library());
primus = new require('primus')(require('http').createServer(), {transformer: 'sockjs',  pathname : '/hub'}); fs.writeFileSync('static/primus/primus-sockjs.js',primus.library());