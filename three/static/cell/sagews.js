var sagews = {}; /* namespace for application */

sagews.log = function(s) {
    var err;
    try { 
        console.log(s);  // TODO: not cross platform!
    } catch(err) {
//alert(s);
    }
}

sagews.walltime = function() { return (new Date()).getTime(); }

sagews.Backend = function(options) {

    // message types (see mesg.proto)
    EXECUTE_CODE = 1; START_SESSION = 2; TERMINATE_SESSION = 3;
    SESSION_DESCRIPTION = 4; SEND_SIGNAL = 5;  OUTPUT = 6;

    /* Merge in default options */
    var opts = $.extend({
	onopen:function(protocol) { sagews.log('open -- '+protocol); },
	onclose:function() { sagews.log('onclose'); },
	url:window.location.protocol + "//" + window.location.host + "/backend",
    }, options||{});

    /* Execution of code */
    var id=0;
    var output_callbacks = {};
    var time;
    function execute(input, callback) {
	output_callbacks[id] = callback;
	time = sagews.walltime();
        mesg = {type:EXECUTE_CODE, id:id, execute_code:{code:input}};
	send(mesg);
	id += 1;
    }

    function onmessage(e) {
	mesg = JSON.parse(e.data);
	sagews.log(mesg);
	$("#time").html((sagews.walltime() - time) + " milliseconds");
	if (mesg.type == OUTPUT) {
    	    output_callbacks[mesg.id](mesg);
    	    if(mesg.done) { delete output_callbacks[mesg.id]; }
	}
    }

    /* Connection to backend */
    var conn, retry_delay=1;
    function connect() {
	conn = new SockJS(opts.url);
	conn.onclose = function() { 
	    opts.onclose();
	    if (retry_delay<2048) { retry_delay *= 2; }
	    sagews.log("Trying to reconnect in " + retry_delay + " milliseconds");
	    setTimeout(connect, retry_delay);
	}
	conn.onopen = function () { 
	    sagews.log("connected.");
	    opts.onopen(conn.protocol); 
	    retry_delay = 1; 
	};
	conn.onmessage = onmessage;
    }
    connect();

    function send(obj) {
	conn.send(JSON.stringify(obj));
    }

    /* The actual backend object */
    return {
	conn:conn,
	send:send,
	execute:execute,
	connect:connect,
    };
}
