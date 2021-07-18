/*
Define some global variables that loading some
of the libraries depends on, either due to node.js
polyfills or old-school jQuery.
*/

// node.js polyfill -- needed for some modules to load in the browser.
// must use require so gets loaded immediately.
import { Buffer } from "buffer";
window.Buffer = Buffer;

// And jQuery.
import * as jQuery from "jquery";
window.$ = window.jQuery = jQuery;
