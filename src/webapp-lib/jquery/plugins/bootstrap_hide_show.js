(function($) {
  var hide, show;
  show = $.fn.show;
  $.fn.show = function() {
    this.removeClass("hidden hide");
    return show.apply(this, arguments);
  };
  hide = $.fn.hide;
  return $.fn.hide = function() {
    this.addClass("hidden hide");
    return hide.apply(this, arguments);
  };
})(window.jQuery);