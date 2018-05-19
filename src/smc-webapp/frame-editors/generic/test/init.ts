// import {init} from "./util";

// const w = window as any;
// (window as any).test_init = init;

const w = window as any;

w.test_load = {}

w.test_load.markdown = function load_markdown() {
  require('../../markdown-editor/test/basic');
}


