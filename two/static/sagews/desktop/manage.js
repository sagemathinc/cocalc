$(function() {
    $('#theme-switcher').themeswitcher({height:400, closeOnSelect:false});

    $("#tabs").tabs({
	select: function(event, ui) { console.log(ui.tab); }
    });

    $("#tab-backend").tabs({
	show: function(event, ui) {
	    var id = ui.panel.id;
	    if (id === "tab-backend-show") {
		$.getJSON("manage/backends/list_all", function(data) {
		    ui.panel.innerHTML = objlist_to_ul(data, ['id', 'uri', 'unix_user']);
		});
	    }
	}
    });

    $('#tab-backend-addremove-remove').button({icons:{primary:'ui-icon-info'}}).click(
	function() {
	    $.post('manage/backends/remove', 
		   {'id':$('#tab-backend-addremove-remove-input').val()},
		   function(data, status) {
		       console.log(status);
		       console.log(data);
		   }, 'json');
    });

    $('#tab-backend-addremove-add').button({icons:{primary:'ui-icon-circle-plus'}}).click(function(event,ui) {
    });


});


function objlist_to_ul(v, fields) {
    var s = '<ul>';
    var w;
    var i,j;
    for(i=0; i<v.length; i++) {
	w = [];
	for (j=0; j<fields.length; j++) {
	    w.push(fields[j] + '=' + v[i][fields[j]]);
	}
	s += '<li> <button id="button-'+i+'">Start</button><button>Stop</button><button>Edit</button>' + w.join(', ') + '</li>';
    }
    s += '</ul>';
    return s;
}

