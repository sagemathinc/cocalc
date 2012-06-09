$(function() {

    $("#tabs").tabs({
	select: function(event, ui) { console.log(ui.tab); }
    });

    $("#tab-backend").tabs({
	show: function(event, ui) {
	    var id = ui.panel.id;
	    if (id === "tab-backend-summary") {
		$.getJSON("manage/backends/summary", function(data) {
		    ui.panel.innerHTML = data.count + " backends";
		});
	    } else if (id === "tab-backend-show") {
		$.getJSON("manage/backends/list_all", function(data) {
		    ui.panel.innerHTML = objlist_to_ul(data, ['id', 'uri', 'unix_user']);
		});
	    }
	}
    });

    $('#tab-backend-addremove-remove').button().click(function() {
	$.post('manage/backends/remove/', 
	       {'id':$('#tab-backend-addremove-remove-input').val()},
	       function(data, success) {
		   console.log(success);
		   console.log(data);
	}, 'json');
    });

    $('#tab-backend-addremove-add').button().click(function(event,ui) {
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
	s += '<li>' + w.join(', ') + '</li>';
    }
    s += '</ul>';
    return s;
}

