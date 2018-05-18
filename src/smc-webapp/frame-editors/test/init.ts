// import {init} from "./util";

// const w = window as any;
// (window as any).test_init = init;

import {tests} from "./scratch";

const w = window as any;

function load_scratch() {
  tests(w.describe, w.it);
}

w.load_scratch = load_scratch;
