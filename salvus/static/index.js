$(function(){
    $("#execute").button();
    $("#google").button().click(function() { window.location = "/tornado/auth/google"; });
    $("#facebook").button().click(function() { window.location = "/tornado/auth/facebook"; });
    $("#sign_out").button().click(function() { $.get("/tornado/auth/logout", function() { username(); }) });

    function username() { $("#username").load("/tornado/auth/username"); }
    username();

    $("#connection_status").html("connecting..."); 

    var backend = sagews.Backend(
	{'onopen':function(protocol) { $("#connection_status").html("connected ("+protocol+")"); },
	 'onclose':function() { $("#connection_status").html("reconnecting..."); }});

    function execute_code() {
	$("#output").val("");
	$("#time").html("");
	$("#run_status").html("running");
	backend.execute($("#input").val(), 
		function(mesg) { 
		    var o = $("#output");
		    o.val(o.val() + mesg.output.stdout);
		    if (mesg.output.stderr) {
			o.val(o.val() + "\n!!!!!!!!!!!!!!\n" + mesg.output.stderr + "\n!!!!!!!!!!!!!\n");
		    }
		    $("#run_status").html(mesg.output.done?"":"running...");
		});
    }

    $("#execute").click(function(e) { execute_code(); });
    $("body").keydown(function(e) {
	if (e.which == 13 && e.shiftKey) { execute_code(); return false; }
    });
	    
})


