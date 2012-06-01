/* 
backend -- basic javascript client library for the backend sage workspace

  (c) 2012, William Stein
*/

var sagews = {}; 

sagews.walltime = function () { return (new Date()).getTime(); }

sagews.socket = function(options) { 

    /* a socket.io socket connection to the server */
    var socket = new io.connect('http://' + window.location.host);

    /* handler functions specified by options */
    var opts = $.extend({
	recv:function(mesg) {},
	connect:function() {},
	disconnect:function() {}
	}, options||{});

    socket.on('recv', opts.recv);
    socket.on('disconnect', opts.disconnect);
    socket.on('connect', opts.connect);

    /* send message directly to a session */
    socket.session_send = function(id, mesg) {
	socket.emit('session_send', id, mesg);
    }

    /* create a new session */
    var new_session_callbacks = new Array();

    socket.on('new_session', function(id) {
	new_session_callbacks.shift()(id);
    });

    socket.new_session = function (callback) {
	new_session_callbacks.push(callback);
	socket.emit('new_session');
    }

    return socket;

}


    

