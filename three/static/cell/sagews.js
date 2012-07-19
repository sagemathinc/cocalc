var sagews = {}; /* namespace for application */

sagews.log = function(s) {
    console.log(s);  // TODO: not cross platform!
}

sagews.walltime = function() { return (new Date()).getTime(); }

sagews.Backend = function(options) {

    /* Merge in default options */
    var opts = $.extend({
	onopen:function(protocol) { sagews.log('open -- '+protocol); },
	onclose:function() { sagews.log('onclose'); },
	url:"http://" + window.location.host + "/backend",
    }, options||{});

    /* Connection to backend */
    var conn;
    function connect() {
	conn = new SockJS(opts.url);
	conn.onopen = function () { opts.onopen(conn.protocol); };
	conn.onclose = opts.onclose;
    }
    connect();

    function send(obj) {
	conn.send(JSON.stringify(obj));
    }

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
    conn.onmessage = function(e) {
	$("#time").html((sagews.walltime() - time) + " milliseconds");
	mesg = JSON.parse(e.data);
	execute_callbacks[mesg.id](mesg);
	if(mesg.done) { delete execute_callbacks[mesg.id]; }
    }

    /* The actual backend object */
    return {
	conn:conn,
	send:send,
	execute:execute,
	connect:connect,
    };
}
