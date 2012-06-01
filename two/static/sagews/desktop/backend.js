/*

desktop/backend -- javascript client for desktop backend client

*/

var socket = sagews.socket({
    'recv':function(mesg) { console.log(mesg); },
    'connect':function() {  console.log("connected."); },
    'disconnect':function() { console.log("disconnected."); },
});

