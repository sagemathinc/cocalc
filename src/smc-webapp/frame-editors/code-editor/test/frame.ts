import {
  TestEditor,
  describe,
  before,
  after,
  it,
  expect
} from "../../generic/test/util";

describe("CodeEditor - frame splitting tests", function() {
  this.timeout(10000);
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
      const frame_tree = editor.store
        .getIn(["local_view_state", "frame_tree"])
        .toJS();
      expect(frame_tree.type).to.equal("cm");
      expect(frame_tree.first).to.not.exist;
      expect(frame_tree.second).to.not.exist;
      expect(frame_tree.id).to.exist;
    });

    it("splits in the row direction (so draws a horizontal split line) with default options", function() {
      editor.actions.split_frame("row");
      const frame_tree = editor.store
        .getIn(["local_view_state", "frame_tree"])
        .toJS();
      expect(frame_tree.type).to.equal("node");
      expect(frame_tree.direction).to.equal("row");
      expect(frame_tree.first.type).to.equal("cm");
      expect(frame_tree.second.type).to.equal("cm");
    });

    it("resets to default state", function() {
      editor.actions.reset_frame_tree();
      const frame_tree = editor.store
        .getIn(["local_view_state", "frame_tree"])
        .toJS();
      expect(frame_tree.type).to.equal("cm");
      expect(frame_tree.first).to.not.exist;
      expect(frame_tree.second).to.not.exist;
    });

    it("splits in the col direction", function() {
      editor.actions.split_frame("col");
      const frame_tree = editor.store
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
      const frame_tree = editor.store
        .getIn(["local_view_state", "frame_tree"])
        .toJS();
      expect(frame_tree.first.direction).to.equal("row");
      expect(frame_tree.first.first.type).to.equal("cm");
      expect(frame_tree.first.second.type).to.equal("cm");
    });

    // continuing the test from above (with a nontrivial frame tree with 3 leafs...)
    it("tests set_active_id", async function() {
      const tree = editor.store
        .getIn(["local_view_state", "frame_tree"])
        .toJS();

      // We list all the leaf id's...
      const leaf_ids = [
        tree.first.first.id,
        tree.first.second.id,
        tree.second.id
      ];
      // Then set each in turn to be the active_id.
      for (const id of leaf_ids) {
        await editor.actions.set_active_id(id);
        expect(editor.store.getIn(["local_view_state", "active_id"])).to.equal(
          id
        );
      }
      // Try setting a non-existing id.
      try {
        editor.actions.set_active_id("cocalc");
        expect("should raise").to.equal("exception but did not!");
      } catch (err) {
        expect(err.toString()).to.equal(
          'Error: set_active_id - no leaf with id "cocalc"'
        );
      }
      // Above should not change what was active.
      expect(editor.store.getIn(["local_view_state", "active_id"])).to.equal(
        leaf_ids[2]
      );

      // Try setting a non-leaf id -- this should also fail.
      try {
        editor.actions.set_active_id(tree.id);
        expect("should raise").to.equal("exception but did not!");
      } catch (err) {
        expect(err.toString()).to.equal(
          `Error: set_active_id - no leaf with id "${tree.id}"`
        );
      }
    });

    it("tests close_frame", function() {
      // from the above test, there are now 3 leafs.  The first has two leafs, and the second has one.
      // Let's close the second leaf.
      const tree = editor.store
        .getIn(["local_view_state", "frame_tree"])
        .toJS();
      editor.actions.close_frame(tree.second.id);
      // Now there should be a single root node with exactly two leafs.
      const tree2 = editor.store
        .getIn(["local_view_state", "frame_tree"])
        .toJS();
      expect(tree2.first.id).to.equal(tree.first.first.id);
      expect(tree2.second.id).to.equal(tree.first.second.id);
      // Next, close another frame.
      editor.actions.close_frame(tree2.first.id);
      // And now there is just the one root node as a leaf.
      const tree3 = editor.store
        .getIn(["local_view_state", "frame_tree"])
        .toJS();
      expect(tree3.id).to.equal(tree.first.second.id);
    });

    describe("tests that closing frames makes the correct frame active -- two splits", function() {
      let t: any;
      it("splits twice so that there are three frames total (looks like a 'T')", function() {
        editor.actions.split_frame("row");
        t = editor.store.getIn(["local_view_state", "frame_tree"]).toJS();
        editor.actions.split_frame("col", t.second.id);
        t = editor.store.getIn(["local_view_state", "frame_tree"]).toJS();
      });
      it("makes bottom left active", () =>
        editor.actions.set_active_id(t.second.first.id));
      it("closes bottom right frame", () =>
        editor.actions.close_frame(t.second.second.id));
      it("checks that bottom right left is still active", () =>
        expect(editor.store.getIn(["local_view_state", "active_id"])).to.equal(
          t.second.first.id
        ));
      it("splits again", () =>
        editor.actions.split_frame("col", t.second.first.id));
      it("makes the bottom right active", () => {
        t = editor.store.getIn(["local_view_state", "frame_tree"]).toJS();
        editor.actions.set_active_id(t.second.second.id);
      });
      it("closes the bottom right frame", () =>
        editor.actions.close_frame(t.second.second.id));
      it("checks that the previous active frame becomes active", () =>
        expect(editor.store.getIn(["local_view_state", "active_id"])).to.equal(
          t.second.first.id
        ));
    });

    describe("tests that spitting frames makes the newly created frame active", function() {
      it("resets the frame", () => editor.actions.reset_frame_tree());
      it("splits the frame along a row", () =>
        editor.actions.split_frame("row"));
      it("verifies that the new bottom frame is active (not the top)", function() {
        const t = editor.store.getIn(["local_view_state", "frame_tree"]).toJS();
        expect(editor.store.getIn(["local_view_state", "active_id"])).to.equal(
          t.second.id
        );
      });
    });

    describe("tests close_frame by simulating a click on the close button", function() {
      it("resets the frame", () => editor.actions.reset_frame_tree());
      it("splits the frame along a row", () =>
        editor.actions.split_frame("row"));
      it("clicks the close button on the TOP frame", function() {
        const t = editor.store.getIn(["local_view_state", "frame_tree"]).toJS();
        const elt = editor.actions._get_titlebar_jquery(t.first.id);
        const close_button = elt.find('button[title="Close this frame"]');
        close_button.click();
        const t2 = editor.store
          .getIn(["local_view_state", "frame_tree"])
          .toJS();
        expect(t2).to.contain({ id: t.second.id, type: "cm" });
      });
    });

    describe("tests toggling set_frame_full", function() {
      let t: any;
      it("resets the frame and split along a row", () => {
        editor.actions.reset_frame_tree();
        editor.actions.split_frame("row");
        t = editor.store.getIn(["local_view_state", "frame_tree"]).toJS();
      });
      it("Confirms that the bottom frame is the focused active one.", () => {
        expect(editor.store.getIn(["local_view_state", "active_id"])).to.equal(
          t.second.id
        );
      });
      it("Does action to fullscreen the bottom frame.", () =>
        editor.actions.set_frame_full(t.second.id));
      it("Verifies that full is set properly.", () =>
        expect(editor.store.getIn(["local_view_state", "full_id"])).to.equal(
          t.second.id
        ));
      it("Leaves fullscreen and sees that bottom frame is active again", function() {
        editor.actions.unset_frame_full();
        expect(editor.store.getIn(["local_view_state", "full_id"])).to.not
          .exist;
        expect(editor.store.getIn(["local_view_state", "active_id"])).to.equal(
          t.second.id
        );
      });
      it("Tries to fullscreen a non-existing frame and gets an error.", function() {
        try {
          editor.actions.set_frame_full("cocalc");
          expect("this should").to.equal("not have worked!");
        } catch (err) {
          expect(err.toString()).to.equal(
            'Error: set_frame_full -- no leaf with id "cocalc"'
          );
        }
      });
      it("Clicks the fullscreen button to enter fullscreen.", function() {
        const elt = editor.actions._get_titlebar_jquery(t.second.id);
        elt.find('button[title="Show only this frame"]').click();
        expect(editor.store.getIn(["local_view_state", "full_id"])).to.equal(
          t.second.id
        );
      });
      it("Clicks the unfullscreen button again to leave fullscreen.", function() {
        const elt = editor.actions._get_titlebar_jquery(t.second.id);
        elt.find('button[title="Show all frames"]').click();
        expect(editor.store.getIn(["local_view_state", "full_id"])).to.not
          .exist;
      });
    });
  });
});
