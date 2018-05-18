import * as $ from "jquery";
import {callback} from "awaiting";

const w : any = window as any;

w.mocha.setup("bdd");

async function mocha_run(): Promise<number> {
  $(".page-container").css('opacity', .3);
  $("#mocha").empty();
  const failures : number = await callback(w.mocha.run);
  console.log("DONE", failures);
  $(".page-container").hide();
  if (failures === 0) {
    $(".page-container").fadeOut();
  } else {
    $(".page-container").css('opacity', .15);
  }
  return failures;
}

w.mocha_run = mocha_run;

function mocha_reset(): void {
  $("#mocha").empty();
  $(".page-container").show().css('opacity', 1);
}

w.mocha_reset = mocha_reset;
