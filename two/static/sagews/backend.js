/* 
sagews -- basic javascript client library for the sage workspace server

AUTHOR: 
   - William Stein
*/

/* Namespace for the application */

var sagews = {};

sagews.socket = function(options) { 
    
    var socket = new io.connect('http://' + window.location.host);

    var opts = $.extend({
	recv:function(mesg) {},
	connect:function() {},
	disconnect:function() {}
	}, options||{});
    
    socket.on('recv', opts.recv);
    socket.on('disconnect', opts.disconnect);
    socket.on('connect', opts.connect);

    socket.session_send = function(id, mesg) {
	socket.emit('session_send', id, mesg);
    }

    var new_session_callbacks = new Array();

    socket.on('new_session', function(id) {
	new_session_callbacks.shift()(id);
    });

    socket.new_session = function (callback) {
	new_session_callbacks.push(callback);
	socket.emit('new_session');
    }

}


    

