import {
  Actions as WhiteboardActions,
  State as WhiteboardState,
} from "../whiteboard-editor/actions";
import type { FrameTree } from "../frame-tree/types";
import fixedElements from "./fixed-elements";
import { Map as ImmutableMap } from "immutable";
import type { ElementMap } from "../whiteboard-editor/types";
import { open_new_tab } from "@cocalc/frontend/misc";

export interface State extends WhiteboardState {
  speakerNotes: ImmutableMap<string, ElementMap>;
}

export class Actions extends WhiteboardActions<State> {
  readonly mainFrameType = "slides";
  readonly fixedElements = fixedElements;

  _init2(): void {
    this.setState({});
    this._syncstring.on("change", this.updateSpeakerNotes.bind(this));
    super._init2();
  }

  _raw_default_frame_tree(): FrameTree {
    return {
      direction: "col",
      type: "node",
      first: { type: "pages" },
      second: {
        direction: "row",
        type: "node",
        first: { type: "slides" },
        second: {
          direction: "col",
          type: "node",
          first: { type: "speaker_notes" },
          second: { type: "table_of_contents" },
          pos: 0.8,
        },
        pos: 0.8,
      },
      pos: 0.15,
    };
  }

  help(): void {
    open_new_tab("https://doc.cocalc.com/slides.html");
  }

  private updateSpeakerNotes(keys) {
    const speakerNotes0 = this.store.get("speakerNotes");
    let speakerNotes = speakerNotes0 ?? ImmutableMap();
    for (const key of keys ?? []) {
      const id = key.get("id");
      if (!id) continue;
      const element = this._syncstring.get_one(key);
      const oldElement = speakerNotes0?.get(id);
      if (!element) {
        if (oldElement?.get("type") != "speaker_notes") continue;
        const page = oldElement?.get("page");
        if (page == null) continue;
        // there is a delete.
        speakerNotes = speakerNotes.delete(page);
      } else {
        if (element.get("type") != "speaker_notes") continue;
        speakerNotes = speakerNotes.set(element.get("page"), element);
      }
    }

    if (speakerNotes !== speakerNotes0) {
      this.setState({ speakerNotes });
    }
  }

  setPage(frameId: string, pageNumber: number): void {
    const node = this._get_frame_node(frameId);
    if (node == null) return;
    super.setPage(frameId, pageNumber);
    if (node.get("type") == this.mainFrameType) {
      const id: string | undefined =
        this._get_most_recent_active_frame_id_of_type("speaker_notes");
      if (id != null && id != frameId) {
        this.setPage(id, pageNumber);
      }
    }
  }

  createPage(commit: boolean = true): string {
    const page = super.createPage(false);
    // add some "template content". Obviously, this is very preliminary!
    this.createElement(
      undefined,
      {
        data: {
          color: "#252937",
          fontSize: 24,
          placeholder: "# Click to edit title\n\n",
          initStr: "\n# \n",
        },
        h: 123,
        id: "be9e3736",
        page,
        type: "text",
        w: 847,
        x: -200,
        y: -492,
        z: 0,
      },
      false
    );
    this.createElement(
      undefined,
      {
        data: {
          color: "#525252",
          fontSize: 18,
          placeholder: "## Click to edit subtitle\n\n",
          initStr: "\n## \n",
        },
        h: 110,
        id: "cdf12aea",
        page,
        type: "text",
        w: 847,
        x: -200,
        y: -393,
        z: 1,
      },
      false
    );
    if (commit) {
      this.syncstring_commit();
    }
    return page;
  }
}
