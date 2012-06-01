/*

desktop/backend -- javascript client for desktop backend client

*/

var callback = 0;
var t = 0;
var last_id = -1;

var socket = sagews.socket({
    'recv':function(mesg) { callback(sagews.walltime()-t); },
    'connect':function() { /* console.log("connected.");*/ },
    'disconnect':function() { /*console.log("disconnected.");*/ },
});

socket.new_session( function(id) { last_id = id; /*console.log("new session: "+ id);*/ } );

function test(f) {
    callback = f;
    t = sagews.walltime();
    socket.session_send(last_id, {'cmd':'execute', 'code':'2+2'});
}

