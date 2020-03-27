/*
Utilities for testing
*/

/*
Set the given line in the given codemirror instance to be empty.
Then simultate typing the given content into the line.
When done verify that the result is as it should be.
*/

import { merge } from "smc-util/misc2";
import * as CodeMirror from "codemirror";
import { delay } from "awaiting";

interface TestLineOptions {
  cm: CodeMirror.Doc;
  length?: number;
  line?: number;
  burst?: number;
  delay?: number; // wait in ms before "typing" chunks
  wait?: number; // wait this long between main steps
}

interface TestLineOptions1 {
  cm: CodeMirror.Doc;
  length: number;
  line: number;
  burst: number;
  delay: number;
  wait: number;
}

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export async function test_line(opts0: TestLineOptions): Promise<void> {
  const opts: TestLineOptions1 = merge(
    {
      length: 48,
      line: 1,
      burst: 10,
      delay: 500,
      wait: 2500,
    },
    opts0
  );
  if (opts.length === undefined) opts.length = 48;

  // as any due to this being basically an evil hack.
  if ((opts.cm as any).__test_line) {
    throw Error("already testing this cm!");
  }
  (opts.cm as any).__test_line = true;

  let content: string = "";
  for (let i = 0; i < Math.ceil(opts.length / ALPHA.length); i++) {
    content += ALPHA;
  }
  content = content.slice(0, opts.length);
  const line: number = opts.line - 1;

  // Do the i-th burst of writing, then wait.
  async function f(i: number): Promise<void> {
    console.log("chunk", i);
    // put this chunk at the end of the line
    const chunk = content.slice(i * opts.burst, (i + 1) * opts.burst);
    opts.cm.replaceRange(
      opts.cm.getLine(line) + chunk + "\n",
      { line, ch: 0 },
      { line: line + 1, ch: 0 }
    );
    if (opts.cm.getLine(line) !== content.slice(0, (i + 1) * opts.burst)) {
      throw Error("ERROR: corrupted!");
    }
    await delay(opts.delay);
  }

  // Function that we'll use to verify that the line is as it should be after writing content.
  function verify() {
    console.log("verifying...");
    if (opts.cm.getLine(line) !== content) {
      console.log(`content='${content}'`);
      console.log(`getLine='${opts.cm.getLine(line)}'`);
      throw Error("FAIL -- input was corrupted!");
    }
  }

  // Finally do the test:
  try {
    console.log("do test, starting at ", new Date());

    // Empty the line in prep for testing.
    opts.cm.replaceRange("\n", { line, ch: 0 }, { line: line + 1, ch: 0 });

    // Do the tests, one after the other.  YES, we do want await each before doing the next.
    for (let i = 0; i <= Math.floor(opts.length / opts.burst); i++) {
      await f(i);
    }

    // Did the test work?
    verify();

    // Check again, just in case.
    console.log("wait before verifying second time.");
    await delay(opts.wait);
    verify();

    // No exceptions raised.
    console.log("SUCCESS");
  } catch (err) {
    // Something went wrong.
    console.warn("FAIL -- ", err);
  } finally {
    delete (opts.cm as any).__test_line;
  }
}
