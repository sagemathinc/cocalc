$(function(){
    $("#execute").button();
    $("#google").button().click(function() { window.location = "/backend/auth/google"; });
    $("#facebook").button().click(function() { window.location = "/backend/auth/facebook"; });
    $("#sign_out").button().click(function() { $.get("/backend/auth/logout", function() { username(); }) });

    function username() { $("#username").load("/backend/auth/username"); }
    username();

    $("#connection_status").html("connecting..."); 

    var backend = sagews.Backend(
	{'onopen':function(protocol) { $("#connection_status").html("connected ("+protocol+")"); },
	 'onclose':function() { $("#connection_status").html("reconnecting..."); }});

    function execute_code() {
	$("#output").val("");
	$("#run_status").html("running");
	backend.execute($("#input").val(), 
		function(mesg) { 
		    var o = $("#output");
		    o.val(o.val() + mesg.output.stdout);
		    if (mesg.output.stderr) {
			o.val(o.val() + "\n!!!!!!!!!!!!!!\n" + mesg.output.stderr + "\n!!!!!!!!!!!!!\n");
		    }
		    $("#run_status").html(mesg.output.done?"done":"running...");
		});
    }

    $("#execute").click(function(e) { execute_code(); });
    $("body").keydown(function(e) {
	if (e.which == 13 && e.shiftKey) { execute_code(); return false; }
    });
	    
})


