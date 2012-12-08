$(function() {
    feature.coffee
 
    misc_page.coffee

    connect_to_hub.coffee

    tracking.coffee

    top_navbar.coffee

    alerts.coffee

    account.coffee
    feedback.coffee

    worksheet1.coffee

    /* TODO: I need a damned module system... but not yet. */
    exports = {};
    (function() {
    worksheet.coffee
    })();
    worksheet0 = exports;

    worksheet-cm.coffee

    projects.coffee
    project.coffee

    exit_confirmation.coffee

    last.coffee

    window.history.pushState("", "", "/")  /* get rid of # part of URL */

})
