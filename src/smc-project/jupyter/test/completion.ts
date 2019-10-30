/*
Test completion API
*/

import {} from "mocha";
import * as expect from "expect";
import * as common from "./common";

// global kernel being tested at any point.
let kernel: common.JupyterKernel;

// This checks that on input the given obj={code:?, cursor_pos:?}
// the resulting matches *contains* matches
function check(obj: { code: string; cursor_pos: any }, matches?: string[]) {
  it(`checks that ${JSON.stringify(obj)} includes ${
    matches ? JSON.stringify(matches) : "nothing"
  }`, async function() {
    let resp = await kernel.complete({
      code: obj.code,
      cursor_pos: obj.cursor_pos != null ? obj.cursor_pos : obj.code.length
    });
    if (matches === undefined) {
      expect(resp.matches.length).toBe(0);
    } else {
      for (let m of matches) {
        expect(resp.matches).toContain(m);
      }
    }
  });
}

describe("complete some things using python2 kernel -- ", function() {
  this.timeout(10000);

  it("creates a python2 kernel", function() {
    kernel = common.kernel("test-python2");
  });

  it("completes 'imp'", async function() {
    const resp = await kernel.complete({
      code: "imp",
      cursor_pos: 2
    });
    expect(resp).toEqual({
      matches: ["import"],
      status: "ok",
      cursor_start: 0,
      cursor_end: 2
    });
  });

  check({ code: "imp", cursor_pos: 3 }, ["import"]);
  check({ code: "in", cursor_pos: 2 }, ["in", "input", "int", "intern"]);
  check({ code: "in", cursor_pos: 1 }, [
    "id",
    "if",
    "import",
    "in",
    "input",
    "int",
    "intern",
    "is",
    "isinstance",
    "issubclass",
    "iter"
  ]);

  check({ code: "alsdfl", cursor_pos: 5 });

  it("creates a new identifier", async function() {
    await common.exec(kernel, 'alsdfl = {"foo":"bar"}');
  });

  check({ code: "alsdfl", cursor_pos: 6 }, ["alsdfl"]);

  check({ code: "alsdfl._", cursor_pos: 8 }, [
    "alsdfl.__class__",
    "alsdfl.__cmp__"
  ]);

  it("closes the kernel", () => kernel.close());
});

describe("complete some things using sage kernel -- ", function() {
  this.timeout(30000); // sage can be very slow to start.

  it("creates a sage kernel", function() {
    kernel = common.kernel("test-sagemath");
  });

  check({ code: "Ell", cursor_pos: 3 }, [
    "Ellipsis",
    "EllipticCurve",
    "EllipticCurve_from_c4c6",
    "EllipticCurve_from_cubic",
    "EllipticCurve_from_j",
    "EllipticCurve_from_plane_curve",
    "EllipticCurveIsogeny",
    "EllipticCurves_with_good_reduction_outside_S"
  ]);

  check({ code: "e.", cursor_pos: 2 }, [
    "e.abs",
    "e.add",
    "e.add_to_both_sides",
    "e.additive_order",
    "e.arccos"
  ]);
  check({ code: "e.fac", cursor_pos: 5 }, ["e.factor"]);

  it("closes the kernel", () => kernel.close());
});
