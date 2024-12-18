import { delay } from "awaiting";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { redux } from "@cocalc/frontend/app-framework";
import { debounce } from "lodash";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import type { SyncDoc } from "@cocalc/sync/editor/generic/sync-doc";
import { aux_file } from "@cocalc/util/misc";
import { once } from "@cocalc/util/async-utils";

interface CodemirrorPosition {
  line: number;
  ch: number;
}

interface CodemirrorRange {
  from: CodemirrorPosition;
  to: CodemirrorPosition;
}

type Position = CodemirrorRange;

export class Comments {
  private syncdoc: SyncDoc;
  private project_id: string;
  private path: string;
  private getDoc: Function;
  private commentsDB?: SyncDoc;

  constructor({ getDoc, path, project_id, syncdoc }) {
    this.getDoc = getDoc;
    this.path = path;
    this.project_id = project_id;
    this.syncdoc = syncdoc;
    this.initComments();
  }

  setComment = ({
    id,
    pos,
    done,
    noSave,
  }: {
    id: string;
    pos?: Position;
    done?: boolean;
    noSave?: boolean;
  }) => {
    const doc = this.getDoc();
    if (!doc) {
      throw Error("no cm doc, so can't mark");
    }
    for (const mark of doc.getAllMarks()) {
      if (mark.attributes?.style == id) {
        if (pos == null) {
          // also locate it
          const pos1 = mark.find();
          if (pos1 != null) {
            // @ts-ignore
            pos = pos1;
          }
        }
        // overwriting existing mark, so remove that one (gets created again below)
        mark.clear();
      }
    }
    if (pos == null) {
      throw Error("unable to find mark");
    }
    // create the mark
    doc.markText(pos.from, pos.to, {
      css: done ? "" : "background:#fef2cd",
      shared: true,
      attributes: { style: id },
      clearWhenEmpty: false,
    });
    if (!noSave) {
      this.saveCommentsDebounce();
    }
  };

  private getComments = () => {
    const doc = this.getDoc();
    // @ts-ignore  (TODO)
    const time = this.syncdoc.patch_list.newest_patch_time().valueOf();
    const hash = this.syncdoc.hash_of_live_version();
    return doc
      .getAllMarks()
      .filter((mark) => mark.attributes?.style)
      .map((mark) => {
        const id = mark.attributes!.style;
        const done = !mark.css;
        // @ts-ignore
        const { from, to } = mark.find();
        return {
          id,
          time,
          hash,
          done,
          pos: { from, to },
        };
      });
  };

  private commentsPath = () => {
    return aux_file(this.path, "comments");
  };

  getCommentsDB = async () => {
    if (this.commentsDB == null) {
      this.commentsDB = await webapp_client.sync_client.sync_db({
        project_id: this.project_id,
        path: this.commentsPath(),
        primary_keys: ["id"],
        ephemeral: true,
        cursors: true,
      });
      this.syncdoc.on("close", () => {
        this.commentsDB?.close();
      });
      this.commentsDB.on(
        "change",
        debounce(
          () => {
            this.loadComments();
          },
          3000,
          { leading: true, trailing: true },
        ),
      );
      if (this.commentsDB.get_state() != "ready") {
        await once(this.commentsDB, "ready");
      }
    }
    return this.commentsDB;
  };

  private hasComments = () => {
    try {
      const doc = this.getDoc();
      return (
        doc.getAllMarks().filter((mark) => mark.attributes?.style).length > 0
      );
    } catch (_) {
      // expected when no cm is open or document is closed
      return false;
    }
  };

  saveComments = reuseInFlight(async () => {
    if (!this.hasComments()) {
      return;
    }
    let d = 100;
    while (this.syncdoc.has_unsaved_changes()) {
      if (d >= 30000) {
        console.warn(
          "something is going wrong waiting for document to stabilize",
        );
      }
      await delay(d);
      if (this.syncdoc.get_state() == "closed") {
        return;
      }
      d = Math.min(30000, 1.3 * d);
      await this.syncdoc.save();
    }
    // due to above loop, right now there are no unsaved changes, so we can safely
    // get the comments and write them out:
    const comments = this.getComments();
    if (comments == null) {
      return;
    }
    const db = await this.getCommentsDB();
    for (const comment of comments) {
      db.set(comment);
    }
    await db.save_to_disk();
  });

  saveCommentsDebounce = debounce(this.saveComments, 3000);

  loadComments = async (force?) => {
    const db = await this.getCommentsDB();
    const hash = this.syncdoc.hash_of_live_version();
    for (const comment of db.get()) {
      console.log(comment.toJS());
      if (comment.get("hash") == hash || force) {
        console.log("using it!");
        const { id, done, pos } = comment.toJS();
        this.setComment({ id, pos, done, noSave: true });
      } else {
        console.log("NOT using it -- need algorithm to transform");
      }
    }
  };

  initComments = async () => {
    if (
      await redux
        .getProjectActions(this.project_id)
        .path_exists(this.commentsPath())
    ) {
      // probably comments, so load them
      await this.loadComments();
    }
    // also periodically save comments out when activity stops
    this.syncdoc.on("change", this.saveCommentsDebounce);
  };
}
