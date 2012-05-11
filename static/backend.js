/* 

backend -- low level javascript client for communication with the
backend Python process

AUTHOR: 
   - William Stein
*/

/* Namespace for the application */
var sagews_backend = {};

sagews_backend.socket = function(url) {

    var socket = new io.connect(url);  /* todo: handle error */

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

