$(function() {
    hide_all();
    $("#backends").button().click(backends);
    $("#users").button().click(users);
    $("#workspaces").button().click(workspaces);
    $("#pub").button().click(pub);
    $("#account_types").button().click(account_types);
    $("#slaves").button().click(slaves);
});

function hide_all() {
    $('.console').hide();
}

function backends(event, ui) {
    hide_all();
    var box = $('#backends_box');
    box.show(300);
}

function users(event, ui) {

}

function workspaces(event, ui) {

}

function pub(event, ui) {

}

function account_types(event, ui) {

}

function slaves(event, ui) {

}
