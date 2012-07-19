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

    /* Merge in default options */
    var opts = $.extend({
	onopen:function(protocol) { sagews.log('open -- '+protocol); },
	onclose:function() { sagews.log('onclose'); },
	url:window.location.protocol + "//" + window.location.host + "/backend",
    }, options||{});

    /* Execution of code */
    var id=0;
    var execute_callbacks = {};
    var time;
    function execute(input, callback) {
	execute_callbacks[id] = callback;
	time = sagews.walltime();
	send({session:-1, execute:input, id:id});
	id += 1;
    }
    function onmessage(e) {
	mesg = JSON.parse(e.data);
	sagews.log(mesg);
	$("#time").html((sagews.walltime() - time) + " milliseconds");
	execute_callbacks[mesg.id](mesg);
	if(mesg.done) { delete execute_callbacks[mesg.id]; }
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
