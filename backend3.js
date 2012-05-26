/***********************************************************************

 Attempt at making a node.js version of the low-level backend.

npm install socket.io
npm install ws --ws:native

 ***********************************************************************/

function Python() {

    var python = require('child_process').spawn('sage', ['-python']);

    python.on('exit', function (code) {
	console.log('child process exited with code ' + code);
    });
    
    callbacks = [];

    python.stdout.on('data', function(data) {
	data = data.toString();
console.log('data = "'+data+'"');
	var n = data.search('>>> ');
console.log("n="+n);
	if (n >= 0) { 
	    data = data.slice(0,n); 
	    var f = callbacks.pop();
	    f.stdout(data);
	    f.done();
	} else {
	    callbacks[callbacks.length-1].stdout(data);
	}
	    
    });

    python.stderr.on('data', function(data) {
	callbacks[callbacks.length-1].stderr(data, '');
    });

    execute = function(code, options) {
	if (typeof options == 'undefined') {
	    options = {};
	}
	if (typeof options.stdout == 'undefined') {
	    options.stdout = function(value) {}
	}
	if (typeof options.stderr == 'undefined') {
	    options.stderr = function(value) {}
	}
	if (typeof options.done == 'undefined') {
	    options.done = function() {}
	}
	callbacks.push(options)
console.log(callbacks);
	python.stdin.write(code + '\n');
/*	python.stdin.end();*/
    }

    return {python:python, execute:execute}
}


var P = Python();

var opts = {
    stdout:function(x) { console.log(x); },
    stderr:function(x) { console.log('stderr: ' + x); },
    done:function() { console.log('done'); }
};

/*
var i=10;
function done() {
    i -= 1;
    console.log(i);
    if (i>0) {
	console.log("calling again...");
	P.execute('print(2+3)', opts);
    } 
}
*/

//done();

P.execute('import sys; print(1); sys.stdout.flush()', opts);


/*P.execute('print(2)', opts);
P.execute('print(3)', opts);
P.execute('print(4)', opts);*/

/*for(i=0;i<100000;i++)
    P.execute('print('+i+')', opts);
*/

/*
P.execute('from sage.all import *');
P.execute('print(factor(902834089234))', opts);
*/
			 
/*
P.execute('print(8*9)', function(stdout, stderr, done) {
    console.log({stdout:stdout, stderr:stderr, done:done});
    }
);
*/

/*
var http = require("http");

function onRequest(request, response) {
  response.writeHead(200, {"Content-Type": "text/plain"});
  response.write("Hello World");
  response.end();
}

http.createServer(onRequest).listen(8000);

var io = require('socket.io').listen(8000);

io.sockets.on('connection', function (socket) {
  socket.emit('news', { hello: 'world' });
  socket.on('my other event', function (data) {
    console.log(data);
  });
});
*/