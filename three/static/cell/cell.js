$(function(){

    var backend = sagews.Backend(
	{'onopen':function(protocol) { $("#connection_status").html("connected ("+protocol+")"); },
	 'onclose':function() { $("#connection_status").html("disconnected"); }});

    $("#execute").click(function(e) { 
	$("#output").val("");
	$("#run_status").html("running");
	backend.execute($("#input").val(), 
		function(mesg) { 
		    var o = $("#output");
		    o.val(o.val() + mesg.stdout);
		    $("#run_status").html(mesg.done?"done":"running...");
		});
    });

})


