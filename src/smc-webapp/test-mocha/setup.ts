import * as $ from "jquery";

function mocha_runner(): void {
  const mocha_lib = (window as any).mocha;
  mocha_lib.setup("bdd");

  require("./test.ts");

  $(".page-container").hide();
  $("#mocha").empty();
  mocha_lib.run();
}

(window as any).mocha_runner = mocha_runner;

function mocha_reset(): void {
  $("#mocha").empty();
  $(".page-container").show();
}

(window as any).mocha_reset = mocha_reset;
