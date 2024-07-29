/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Evaluate a line of code with the scope containing only a jquery wrapped
element and whatever is available on window.  Obviously not "safe", but
maybe safer/cleaner than nothing.
*/
// element type = jquery wrapped element
export function javascript_eval(line: string, element: any): string {
  let requirejs: any;
  let require: any;
  require = requirejs = () => {
    throw Error(
      "require is not available in CoCalc; if you need a Javascript library, please email help@cocalc.com.",
    );
  };
  let define = (..._) => {
    throw Error("Custom ipywidgets are not yet supported in CoCalc.");
  };
  // @ts-ignore -- entirely for typescript
  const _ = { require, requirejs, define, element };

  try {
    eval(line);
  } catch (err) {
    console.warn(`Jupyter Javascript Error: ${err} -- evaluating "${line}"`);
    return `${err}`;
  }
  return "";
}
