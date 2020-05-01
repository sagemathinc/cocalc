/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

const describe = (window as any).describe;
const it = (window as any).it;

const assert = require("assert");

describe("Array", function () {
  describe("#indexOf()", function () {
    it("should return -1 when the value is not present", function () {
      assert.equal([1, 2, 3].indexOf(4), -1);
    });
  });
  describe("#indexOf()", function () {
    it("should return 1 when the value is not present", function () {
      assert.equal([1, 2, 3].indexOf(4), 1);
    });
  });
});
