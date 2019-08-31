/*
Evaluate a line of code with the scope containing only a jquery wrapped
element and whatever is available on window.  Obviously not "safe", but
maybe safer/cleaner than nothing.
*/
// element type = jquery wrapped element
export function javascript_eval(line: string, element: any): string {
  let requirejs: any;
  let require: any;
  require = requirejs = () =>
    console.warn(
      // TODO: replace "CoCalc"?
      "require is not available in CoCalc; if you need a Javascript library, please email help@cocalc.com."
    );
  require = require = requirejs = requirejs;
  require = require; // Same as below

  // "element" is possibly used in eval.  Do this assign, so typescript thinks
  // that "element" is being used so this will compile.
  element = element;

  let define = (..._) => {
    throw Error("Custom ipywidgets are not yet supported in CoCalc.");
  };
  define = define;

  try {
    eval(line);
  } catch (err) {
    console.warn(`Jupyter Eval Error: ${err} -- evaluating "${line}"`);
    return `${err}`;
  }
  return "";
}
