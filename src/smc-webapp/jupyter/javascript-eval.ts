/*
Evaluate a line of code with the scope containing only a jquery wrapped
element and whatever is available on window.  Obviously not "safe", but
maybe safer/cleaner than nothing.
*/
export function javascript_eval(line: string, element: any) {
  let requirejs: any;
  let require: any;
  require = requirejs = () =>
    console.warn(
      // TODO: replace "CoCalc"?
      "require is not available in CoCalc; if you need a Javascript library, please request it."
    );
  require = require = requirejs = requirejs;
  element = element; // I know, it's so typescript things that "element" is being used so this will compile.
  // TODO: element is jquery wrapped element
  // "element" is possibly used in eval.
  try {
    return eval(line);
  } catch (err) {
    return console.warn(`Jupyter Eval Error: ${err}`);
  }
}
