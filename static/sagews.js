/* 

sagews -- basic javascript client library for the sage workspace server

AUTHOR: 
   - William Stein
*/

/*******************************************************
 *     Start websocket
 ********************************************************/

ws = new WebSocket("ws://" + document.domain + ":5000/ws"); 

/* Namespace for the application */
var sagews = {};

sagews.test = function (mesg) {
    alert(mesg);
}

sagews.Client = function(server) {

    get = function(url, callback) {
	$.getJSON(server + '/' + url, '', function(response, status) { callback(response); });
    }
    
    post = function(url, vars, callback) {
	$.post(server + '/' + url, vars, function(response, status) { callback(response); }, 'json');
    }

    report_output_using_sockets = function(client, cell_id, number, options) {
	ws.onmessage = function (msg) {
	    options.output(msg.data);
	}
    }
	
    /* Using exponentially backed off polling to obtain and report output. */
    /* We support *both* polling and socket.io push, with strong preference for the latter. */
    report_output_using_polling = function(client, cell_id, number, interval, options) {
	client.output_messages(options.session_id, cell_id, number, function(m) {
	    var n=m.data.length, done=false;
	    if (n === 0) { 		/* received no new messages */
		/* exponentially reduce polling frequency */
		interval *= client.polling.backoff;  
		if (interval > client.polling.max_interval) {
		    interval = client.polling.max_interval;
		}
	    } else { /* received new messages */
		interval = client.min_polling_interval;
		var i;
		for (i = 0; i < n; i++) {
		    number = m.data[i].number;
		    if (m.data[i].output) { /* output message */
			options.output(m.data[i].output);
		    }
		    if (m.data[i].modified_files) { /* files message */
			options.modified_files(m.data[i].modified_files);
		    }
		    if (m.data[i].done) { 
			done = true; 
			options.stop(m.data[i].status);
		    }
		}
		/* increment message number so next time we ask for next message */
		number += 1;
	    }
	    if (!done) {
		setTimeout(function() { report_output_using_polling(
                    client, cell_id, number, interval, options); }, interval);
	    }
	});
    }

    
    return {

	polling:{'min_interval':50,  /* when using polling to report output, this is the minimal interval */
		 'backoff':1.1, /* factor to backoff when polling and get no results */
		 'max_interval':1000 /* until we get to this many milliseconds */
		},

	use_sockets:true, 

	/****************/
	/* All Sessions */
	/****************/
	/* kill processes and delete everything about all sessions */
	close_all_sessions: function(callback) { get('close_all_sessions', callback); }, 
	
	/* much information about all sessions */
	sessions: function(callback) { get('sessions', callback); }, 
	
	/********************************************************************/
	/* Session Management: creating, interrupting, killing and deleting */
	/********************************************************************/
	
	/* create a new session */
	new_session: function(callback) { get('new_session', callback); },
	
	/* send interrupt signal to session with given id */
	sigint: function(session_id, callback) { get('sigint/' + session_id, callback); },
	
	/* kill session with given id */
	sigkill: function(session_id, callback) { get('sigkill/' + session_id, callback); },
	
	/* kill process and remove all files for session with given id */
	close_session: function(session_id, callback) { get('close_session/' + session_id, callback); },
	
	/************************/
	/* Session Information: */
	/************************/
	
	/* extensive information about a given session */
	session: function(session_id, callback) { get('session/' + session_id, callback); },
	
	/* get status of session with given id: 'ready', 'running', 'dead' */
	status: function(session_id, callback) { get('status/' + session_id, callback); },
	
	/* list of cells in a given session */
	cells: function(session_id, callback) { get('cells/' + session_id, callback); },
	
	/******************/
	/* Code execution */
	/******************/
	
	/* execute block of code
	   
	   The callback function gets called with a message object m
           as input with a message for each generated output message,
           until a final message m with m.done=true. 
	   options = {
               session_id:nonnegative integer,
	       code:'string of code to eval',
               output:callback function that handles output -- output(string)
               stop:callback function that is called when done -- stop(status), where
                       status is either 'ok' or 'error'. 
	       modified_files:callback function called when files are modified -- modified_files(['a/b','c.txt'])
	   }
        */    
	execute: function(options) { 
	    var opts = $.extend({
		session_id:0,
		code:'',
		output: function(m) { },
		stop: function(status) {},
		modified_files: function(v) {}
		}, options||{});

	    var client = this;  /* since this changes inside post callback below */
	    post('execute/' + options.session_id, {'code':options.code}, function (m) {
		if (m.status == 'error') {
		    options['stop']('error');
		} else if (client.use_sockets) { 
		    /* best option -- register callback, etc. */
		    report_output_using_sockets(client, m.cell_id, 0, options);
		} else {
		    /* fallback to horrible polling option */
		    report_output_using_polling(client, m.cell_id, 0, 
						client.polling.min_interval, options);
		}
	    }); 
	},
	
	/* incremental output produced when executing code -- clients
	 *should* receipt socket.io messages instead of using this.
	 This is used mainly for testing and development purposes.  */
	output_messages: function(session_id, cell_id, number, callback) { 
            get('output_messages/' + session_id + '/' + cell_id + '/' + number, callback);
	}, 
	
	/*******************************************************/
	/* Files: uploading, downloading, deleting and listing */
	/*******************************************************/
	
	/* return list of all files in the given session */
	files: function(session_id, callback) { get('files/' + session_id, callback); }, 
	
	/* put a file or files into the given session */
	put_file: function(session_id, files, callback) { put('put_file/' + session_id, files, callback); },
	
	/* get a file from the given session */
	get_file: function(session_id, path, callback) { get('get_file/' + session_id + '/' + path, callback); },
	
	/* delete a file from the session */
	delete_file: function(session_id, path, callback) { get('delete_file/' + session_id + '/' + path, callback); },
	
	/* wait -- use this only for testing purposes. */
	wait: function(session_id, callback) { 
            /* TODO: do a proper implementation!!!! */
            setTimeout(2000, callback); 
	},
	
	/*********************************************************/
	/* More complicated functionality specific to Javascript */
	/*********************************************************/

    /* end object creation */
    };
}

/* Run tests on the Client object pointed at the given server. 
   Return results of test via callback. */
sagews.TestClient = function(server, callback) {
    var client;
    var results = {};

    function setup(callback) {
      client = sagews.Client(server);
      client.close_all_sessions(function(m) { callback(); } );
    }

    function cleanup() {
      client.close_all_sessions( function(m) {} );
    }

    /* test 1 -- create new session and verify result */
    function test1() {
      setup( function(m) {
      client.new_session(function(m) {
      results.test1 = (m.status === "ok" && m.id === 0);
      cleanup();
      })})
    }
    test1();

    /* test 2 -- create new session, and evaluate 2+3, then verify that we get 5 */
    function test2() {
       setup( function(m) {
       client.new_session(function(m) { alert(m.status);
       client.execute(0, 'print(2+3)', function(m) { alert(m.status);
       client.wait(0, function() { alert('hi');
       results.test2 = true;
       })})})})
    }
    test2();

    return results;
}


/* 

Testing Javascript console code:

foo = sagews.Client('http://localhost:5000')

foo.sessions( function(m) { z = m.sessions; } )

z[0].status
"ready"
z.length

*/