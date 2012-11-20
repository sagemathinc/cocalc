jQuery(function() {
    $('.browser').tooltip({});
});
jQuery(window).on('mercury:ready', function() {
    // do whatever additional loading that should happen here
    // you can also make simple changes to default functionality here
    Mercury.PageEditor.prototype.save = function() {
	var data = this.serialize();
	var lightview = Mercury.lightview(null, {title: 'Saving', closeButton: true});
	setTimeout(function() {
	    var textarea = '<textarea style="width:100%;height:300px" wrap="off">' + top.JSON.stringify(data, null, '  ') + '</textarea>';
	    lightview.loadContent('<div style="width:500px">Saving in the demo is disabled, but you can see what would be sent to the server below.' + textarea + '</div>');
	}, 500);
    }
});

function toggleMercury() {
    if (typeof(Mercury) == 'undefined') {
	alert("Sorry, but Mercury Editor isn't supported by your current browser.\n\nBrowsers that support the required HTML5 spec:\n\n  Chrome 10+\n  Firefox 4+\n  Safari 5+\n  Opera 11.64+\n  Mobile Safari (iOS 5+)");
    } else {
	Mercury.trigger('toggle:interface');
    }
}


jQuery(parent).trigger('initialize:frame');
