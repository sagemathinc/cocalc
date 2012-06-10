$(function() {
    $('#theme-switcher').themeswitcher({height:400, closeOnSelect:false}); 

    $("#tabs").tabs({
	select: function(event, ui) { }
    });

    $("#tab-backend").
	tabs({
	    show: function(event, ui) {
		var id = ui.panel.id;
		if (id === "tab-backend-show") { update_backend_tab(); }
	    }
	});

    $('#tab-backend-add-button').
        button({icons:{primary:'ui-icon-circle-plus'}}).
        click(function(event, ui) {
	    $.post('manage/backends/add',
		   {'data':$('#tab-backend-add-data').val()},
		   function(data, status) {
		       // TODO
		   }, 'json');
	});

    $('#start-all-backends').
        button({icons:{primary:'ui-icon-circle-check'}}).
        click(function(event) {
	    confirm_dialog({
		title:"Start all backends?", yes:"Yes, start them all", no:"Cancel", 
		yes_callback:function() { $.post('manage/backends/start_all', function(data, status) { update_backend_tab(); }); }
            })
	});

    $('#stop-all-backends').
        button({icons:{primary:'ui-icon-circle-close'}}).
        click(function(event) {
	    confirm_dialog({
		title:"Stop all backends?", yes:"Yes, stop them all", no:"Cancel", 
		yes_callback:function() { $.post('manage/backends/stop_all', function(data, status) { update_backend_tab(); }); }
            })
	});

/*    $('#tab-backend-refresh').button().click( update_backend_tab ); */

    $(".template").hide();
});

function update_backend_tab() {
    var area = $('#tab-backend-show-area');
    var s = area.scrollTop();
    $.getJSON("manage/backends/list_all", function(data) {
        var list = $('<ul></ul>'), row;
        for(var i=0; i<data.length; i++) {
	    row = $('<li class="backend_stat_row"></li>');
            var backend = data[i];
	    row.data('id', backend.id);
            if (backend.status === 'running') {
		row.data('url', 'stop');
		var icon = 'circle-close', button = 'Running', color='#090';
	    } else if (backend.status === 'stopped') {
		row.data('url', 'start');
		var icon = 'circle-check', button = 'Stopped', color='#900';
	    } else if (backend.status === 'starting') {
		setTimeout(update_backend_tab, 3000);
		row.data('url', 'stop');
		var icon = 'circle-close', button = 'Starting', color='#830';
	    } else if (backend.status === 'stopping') {
		setTimeout(update_backend_tab, 3000);
		row.data('url', 'start');
		var icon = 'circle-check', button = 'Stopping', color='#830';
	    }
            row.append($('<button style="width:100px">' + button + '</button>').
                button({icons:{primary:'ui-icon-' + icon}}).css({fontSize:'x-small', color:color}).
                click(function() {
                    var r = $(this).parent('li');
                    $.post('manage/backends/'+r.data('url'), {'id':r.data('id')},
                           function(data, status) {
                               update_backend_tab();
                           }, 'json');
                    })
            );
	    row.append($('<button>Delete</button>').button({icons:{primary:'ui-icon-circle-close'}})
		.css({fontSize:'x-small', color:'#a00'})
                .click(function(event) {
		    var id = $(this).parent('li').data('id');
                    confirm_dialog({
			title:"Delete backend "+id+"? This cannot be undone.",
			yes:"Yes, delete it completely!", 
			no:"Cancel",
			yes_callback:function() {
			    $.post('manage/backends/delete', {'id':id}, function(data,status) { update_backend_tab(); } ); 
			}
		    })

                 }));
	    
            row.append($('<span class="backend_stat"> id='+backend.id + '</span>'));
            row.append($('<span class="backend_stat"> ' + backend.URI + ' </span>'));
            row.append($('<span class="backend_stat"> ' + backend.user + ' </span>'));
            row.append($('<span class="backend_stat"> ' + backend.path + ' </span>'));
            row.append($('<span class="backend_stat"> load='+Math.round(backend.load_number*100) + '% </span>'));
            row.append($('<span class="backend_stat"> users='+backend.number_of_connected_users + ' </span>'));
            row.append($('<span class="backend_stat"> workspaces='+backend.number_of_stored_workspaces + ' </span>'));
            row.append($('<span class="backend_stat"> disk='+backend.disk_usage + '/' + backend.disk_available + ' </span>'));
	    if (backend.debug) {
		row.append($('<span class="backend_stat">(debug)</span>'));
	    }

            list.append(row);
        }
        $('#tab-backend-show-area').html(list);
    });
    area.scrollTop(s);
}

/* Will get put in a util.js file */

function confirm_dialog(opts) {
    var options = $.extend({
	title:'Are you sure?',
	yes:'Yes',
	no:'Cancel',
	yes_callback:function() {},
	no_callback:function() {}}, opts||{});

    var buttons = {};
    buttons[options.no] = function() { $(this).dialog("close"); options.no_callback(); }
    buttons[options.yes] = function() { $(this).dialog("close"); options.yes_callback(); }
    $("#dialog-confirm").clone().attr('title',options.title).show().dialog({
	    resizable: false, height:140, modal: true,
	    buttons: buttons
    });
}