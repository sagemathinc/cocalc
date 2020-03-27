import * as $ from "jquery";

import {
  describe,
  it,
  expect,
  redux,
} from "smc-webapp/frame-editors/generic/test/util";

describe("test the account preferences page", function () {
  const page: any = redux.getActions("page");
  describe("test the editor settings panel", function () {
    it("changes to the account prefs page", function () {
      page.set_active_tab("account");
    });
    // THIS does not work, since react's onChange doesn't fire...  HMM...
    it("sets the font size to 20", function () {
      $(".cc-account-prefs-font-size").find("input").val("20");
    });
    it("changes to another page, then back, and confirms the font size is still set to 20", function () {
      page.set_active_tab("help");
      page.set_active_tab("account");
      expect($(".cc-account-prefs-font-size").find("input").val()).to.equal(
        "20"
      );
    });
  });
});
