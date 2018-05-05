/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS202: Simplify dynamic range loops
 * DS205: Consider reworking code to avoid use of IIFEs
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
Utilities for testing
*/

const async = require("async");

const misc = require("smc-util/misc");
const { required, defaults } = misc;

/*
Set the given line in the given codemirror instance to be empty.
Then simultate typing the given content into the line.
When done verify that the result is as it should be.
*/
export function test_line(opts) {
  let i;
  opts = defaults(opts, {
    cm: required,
    length: 48,
    line: 1,
    burst: 10,
    delay: 500, // wait in ms before "typing" chunks
    wait: 2500, // wait this long between main steps
    cb: undefined
  });
  if (opts.cm.__test_line) {
    throw Error("already testing this cm!");
  }
  opts.cm.__test_line = true;
  const n = opts.length;
  const alpha = (() => {
    const result: string[] = [];
    for (i = 0; i < 26; i++) {
      result.push(String.fromCharCode(65 + i));
    }
    return result;
  })().join("");
  let content = (() => {
    let asc, end;
    const result1: string[] = [];
    for (
      i = 0, end = Math.ceil(opts.length / alpha.length), asc = 0 <= end;
      asc ? i < end : i > end;
      asc ? i++ : i--
    ) {
      result1.push(alpha);
    }
    return result1;
  })().join(" ");
  content = content.slice(0, opts.length);
  const line = opts.line - 1;

  // empty the line
  opts.cm.replaceRange("\n", { line, ch: 0 }, { line: line + 1, ch: 0 });

  const f = function(i, cb) {
    console.log("chunk", i);
    // put this chunk at the end of the line
    const chunk = content.slice(i * opts.burst, (i + 1) * opts.burst);
    opts.cm.replaceRange(
      opts.cm.getLine(line) + chunk + "\n",
      { line, ch: 0 },
      { line: line + 1, ch: 0 }
    );
    if (opts.cm.getLine(line) !== content.slice(0, (i + 1) * opts.burst)) {
      cb("ERROR: corrupted!");
      return;
    }
    return setTimeout(cb, opts.delay);
  };

  const verify = function(cb) {
    // not really async...
    console.log("verifying...");
    if (opts.cm.getLine(line) !== content) {
      console.log(`content='${content}'`);
      console.log(`getLine='${opts.cm.getLine(line)}'`);
      return cb("FAIL -- input was corrupted!");
    } else {
      return cb();
    }
  };

  return async.series(
    [
      function(cb) {
        console.log("do test, starting at ", new Date());
        opts.cm.replaceRange("\n", { line, ch: 0 }, { line: line + 1, ch: 0 });
        return async.mapSeries(
          __range__(0, Math.floor(n / opts.burst), true),
          f,
          cb
        );
      },
      cb => verify(cb),
      function(cb) {
        console.log("wait before verifying second time.");
        return setTimeout(cb, opts.wait);
      },
      cb => verify(cb)
    ],
    function(err) {
      delete opts.cm.__test_line;
      if (err) {
        console.warn("FAIL -- ", err);
      } else {
        console.log("SUCCESS");
      }
      return typeof opts.cb === "function" ? opts.cb(err) : undefined;
    }
  );
}

function __range__(left, right, inclusive) {
  let range: any[] = [];
  let ascending = left < right;
  let end = !inclusive ? right : ascending ? right + 1 : right - 1;
  for (let i = left; ascending ? i < end : i > end; ascending ? i++ : i--) {
    range.push(i);
  }
  return range;
}
