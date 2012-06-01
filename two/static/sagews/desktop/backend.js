/*

desktop/backend -- javascript client for desktop backend client

*/

var callback = 0;
var t = 0;
var last_id = -1;

var socket = sagews.socket({
    'recv':function(mesg) { test_callback(mesg); },
    'connect':function() { /* console.log("connected.");*/ },
    'disconnect':function() { /*console.log("disconnected.");*/ },
});

var n = 1000;
function test_callback(mesg) {
    if (typeof mesg.stdout == 'undefined') {
	return;
    }
    if(mesg.stdout[0] == 'a') {
	callback(n + ' tests; took ' + (sagews.walltime()-t)/n + ' ms each on average');
    } else {
	callback(mesg.stdout);
    }
}

socket.new_session( function(id) { last_id = id; /*console.log("new session: "+ id);*/ } );

function test(num, f) {
    n = parseInt(num);
    callback = f;
    t = sagews.walltime();
    callback('start...');
    for(i=0;i<n-1;i++) {
	socket.session_send(last_id, {'cmd':'execute', 'code':'2*'+i});
    }
    socket.session_send(last_id, {'cmd':'execute', 'code':'print "a"'});
}

