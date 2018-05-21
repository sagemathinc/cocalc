import {
  TestEditor,
  describe,
  before,
  after,
  it,
  expect
} from "../../generic/test/util";

describe("CodeEditor - frame splitting tests", function() {
  this.timeout(5000);
  let editor;

  before(async function() {
    editor = new TestEditor("txt");
    await editor.wait_until_loaded();
  });

  after(function() {
    editor.delete();
  });

  describe("split frame in various ways", function() {
    it("verifies that there is only one frame", function() {
      let frame_tree = editor.store
        .getIn(["local_view_state", "frame_tree"])
        .toJS();
      expect(frame_tree.type).to.equal("cm");
      expect(frame_tree.first).to.not.exist;
      expect(frame_tree.second).to.not.exist;
      expect(frame_tree.id).to.exist;
    });

    it("splits in the row direction (so draws a horizontal split line) with default options", function() {
      editor.actions.split_frame("row");
      let frame_tree = editor.store
        .getIn(["local_view_state", "frame_tree"])
        .toJS();
      expect(frame_tree.type).to.equal("node");
      expect(frame_tree.direction).to.equal("row");
      expect(frame_tree.first.type).to.equal("cm");
      expect(frame_tree.second.type).to.equal("cm");
    });

    it("resets to default state", function() {
      editor.actions.reset_frame_tree();
      let frame_tree = editor.store
        .getIn(["local_view_state", "frame_tree"])
        .toJS();
      expect(frame_tree.type).to.equal("cm");
      expect(frame_tree.first).to.not.exist;
      expect(frame_tree.second).to.not.exist;
    });

    it("splits in the col direction", function() {
      editor.actions.split_frame("col");
      let frame_tree = editor.store
        .getIn(["local_view_state", "frame_tree"])
        .toJS();
      expect(frame_tree.type).to.equal("node");
      expect(frame_tree.direction).to.equal("col");
    });

    it("splits first leaf, now in the row direction", function() {
      const id = editor.store.getIn([
        "local_view_state",
        "frame_tree",
        "first",
        "id"
      ]);
      editor.actions.split_frame("row", id);
      let frame_tree = editor.store
        .getIn(["local_view_state", "frame_tree"])
        .toJS();
      expect(frame_tree.first.direction).to.equal("row");
      expect(frame_tree.first.first.type).to.equal("cm");
      expect(frame_tree.first.second.type).to.equal("cm");
    });
  });
});
