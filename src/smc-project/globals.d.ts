import * as $ from "jquery"; // picks jQuery from @types
declare const $ = $;
// declare const $: any; // old more general approach
declare const window: any;
declare const localStorage: any;
// export { $, window, localStorage }; // didn't work, but maybe it should?
