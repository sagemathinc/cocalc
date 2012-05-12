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

    socket.execute = function(selector, code) {
	socket.emit('execute', selector, code);
    }
    socket.set = function(selector, value) {
	socket.emit('set', selector, value);
    }
    socket.set_other = function(selector, value) {
	socket.emit('set_other', selector, value);
    }
    
    return socket;
}

