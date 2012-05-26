/***********************************************************************

 Attempt at making a node.js version of the low-level backend.

 ***********************************************************************/

function Python() {

    var python = require('child_process').spawn('sage', ['-python']);

    python.on('exit', function (code) {
	console.log('child process exited with code ' + code);
    });

    execute = function(code, callback) {
	python.stdout.on('data', function(data) {
	    data = data.toString();
	    var n = data.search('<<<');
	    var done = false;
	    if (n === -1) { 
		data = data.slice(0,n); 
		done = true;
	    }
	    callback(data, '', done);
	});
	python.stderr.on('data', function(data) {
	    callback('', data.toString(), false);
	});
	python.stdin.write(code + '\n');
	python.stdin.end();
    }

    return {python:python, execute:execute}
}

P = Python();

P.execute('print(3**30)', function(stdout, stderr, done) {
    console.log({stdout:stdout, stderr:stderr, done:done});
    }
);
