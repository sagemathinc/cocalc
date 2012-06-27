/*

mobile/backend -- javascript client for mobile backend client

(c) William Stein, 2012

*/

var session_id = -1;

function output(s) {
    var o = $('#output');
    o.html(o.html() + s); /* TODO: append */
    o.scrollTop(99999999);
}

function execute(code) {
    socket.session_send(session_id, {'execute':code});
}

var socket = sagews.socket({
    'recv':function(mesg) {
	console.log(mesg);
	if (typeof mesg.stdout != 'undefined') {
	    output(mesg.stdout);
	}
	if (typeof mesg.stderr != 'undefined') {
	    output(mesg.stderr);
	}
    },
    'connect':function() { output('socket.io connection established\n') },
    'disconnect':function() { output("socket.io disconnected\n"); },
});

socket.new_session(function(id) { 
    session_id = id;
    output('connected to session '+id+'\n'); 
})

