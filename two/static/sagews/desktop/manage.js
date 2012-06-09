$(function() {

    $("#tabs").tabs({
	select: function(event, ui) { console.log(ui.tab); }
    });

    $("#tab-backend-show").button().click( function(event,ui) { 
	var ul = $('#tab-backend-list_of_all').show().find('ul');
    });

    $("#tab-backend-add").button().click( function(event,ui) { } )
    $("#tab-backend-start").button().click( function(event,ui) { } )
    $("#tab-backend-stop").button().click( function(event,ui) { } )

    $('.hide').hide();
});



