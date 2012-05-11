/* 

backend -- low level javascript client for communication with the
backend Python process

AUTHOR: 
   - William Stein
*/

/* Namespace for the application */
var sagews_backend = {};

sagews_backend.socket = function(url, options) {

    var socket = new io.connect(url);  /* todo: handle error */

    var opts = $.extend({
	set:function(selector, s) {},
        stdout:function(selector, s) {},
	stderr:function(selector, s) {},
	done: function(selector) {}}, options||{}
    );

    socket.on('set', opts.set);
    socket.on('stdout', opts.stdout);
    socket.on('stderr', opts.stderr);
    socket.on('done', opts.done);

    socket.execute2 = function(selector, code) {
	socket.emit('execute2', selector, code);
    }
    socket.set = function(selector, value) {
	socket.emit('set', selector, value);
    }
    socket.set_other = function(selector, value) {
	socket.emit('set_other', selector, value);
    }

    socket.execute = function(options) {
	var opts = $.extend({
	    id:0,
	    code:'',
	    stdout: function(s) {},
	    stderr: function(s) {},
	    done: function(s) {}}, options||{});

	socket.on('stdout-'+id, stdout);
	socket.on('stderr-'+id, stderr);
	socket.once('done-'+id, function () { 
	    done(); 
	    socket.removeListener('stdout-'+id, stdout);
	    socket.removeListener('stderr-'+id, stderr);
	});
	socket.emit('execute', id, code);   
    }

    
    
    return socket;
}

