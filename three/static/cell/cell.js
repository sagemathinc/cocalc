$(function(){

    $("#connection_status").html("connecting..."); 

    var backend = sagews.Backend(
	{'onopen':function(protocol) { $("#connection_status").html("connected ("+protocol+")"); },
	 'onclose':function() { $("#connection_status").html("reconnecting..."); }});

    $("#execute").click(function(e) { 
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
    });

})


