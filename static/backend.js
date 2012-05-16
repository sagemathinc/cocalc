/* 
backend -- low level javascript client for communication with the
backend Python process

AUTHOR: 
   - Copyright William Stein, May 2012
*/

/* Namespace for the application */
var sagews_backend = {};

sagews_backend.socket = function(url, options) {

    var socket = new io.connect(url);  /* todo: handle error */

    var opts = $.extend({
        set:function(selector, value) {},
        mesg:function(selector, value) {},
	start: function(selector) {}, 
        stdout:function(selector, value, replace) {},
	stderr:function(selector, value, replace) {},
	done: function(selector) {}}, 
        options||{}
    );

    socket.on('set', opts.set);
    socket.on('mesg', opts.mesg);
    socket.on('start', opts.start);
    socket.on('stdout', opts.stdout);
    socket.on('stderr', opts.stderr);
    socket.on('done', opts.done);

    socket.execute = function(selector, code) {
	opts.start(selector);
	socket.emit('execute', selector, code);
    }
    socket.set = function(selector, value) {
	socket.emit('set_other', selector, value);
    }
    socket.mesg = function(selector, value) {
	socket.emit('mesg_other', selector, value);
    }
    socket.stdout = function(selector, value, replace) {
	socket.emit('stdout_other', selector, value, replace);
    }
    socket.stderr = function(selector, value, replace) {
	socket.emit('stderr_other', selector, value, replace);
    }
    socket.done = function(selector) {
	socket.emit('done_other', selector);
    }
    socket.start = function(selector) {
	socket.emit('start_other', selector);
    }
    
    return socket;
}

