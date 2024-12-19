import { delay } from "awaiting";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { redux } from "@cocalc/frontend/app-framework";
import { debounce } from "lodash";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import type { SyncDoc } from "@cocalc/sync/editor/generic/sync-doc";
import { aux_file } from "@cocalc/util/misc";
import { once } from "@cocalc/util/async-utils";
import type { Doc } from "codemirror";
import type { Mark, Position } from "./types";
import { transformMarks } from "./transform";
import { getPos } from "./util";

export class Comments {
  private syncdoc: SyncDoc;
  private project_id: string;
  private path: string;
  private getDoc: () => Doc | null;
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
      // todo: we could actually safely set in db...
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
    if (!doc) {
      return null;
    }
    // @ts-ignore  (TODO)
    const time = this.syncdoc.patch_list.newest_patch_time().valueOf();
    const hash = this.syncdoc.hash_of_live_version();
    return doc
      .getAllMarks()
      .filter((mark) => mark.attributes?.style)
      .map((mark) => {
        const id = mark.attributes!.style;
        const done = !mark.css;
        return {
          id,
          time,
          hash,
          done,
          pos: getPos(mark),
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
      if (doc == null) {
        return false;
      }
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
    let changes = false;
    for (const comment of comments) {
      const cur = db.get({ id: comment.id });
      if (cur.get("time") >= comment.time) {
        // there is already a newer version
        continue;
      }
      changes = true;
      db.set(comment);
    }
    if (changes) {
      // save to disk is important since comments syncdb is ephemeral
      await db.save_to_disk();
    }
  });

  private saveCommentsDebounce = debounce(this.saveComments, 3000);

  loadComments = async () => {
    const doc = this.getDoc();
    if (doc == null) {
      return;
    }
    const db = await this.getCommentsDB();
    const hash = this.syncdoc.hash_of_live_version();
    const toTransform: { [time: string]: Mark[] } = {};
    for (const mark of db.get()) {
      if (mark.get("hash") == hash) {
        const { id, done, pos } = mark.toJS();
        this.setComment({ id, pos, done, noSave: true });
      } else {
        const time = `${mark.get("time")}`;
        if (toTransform[time] == null) {
          toTransform[time] = [mark.toJS()];
        } else {
          toTransform[time].push(mark.toJS());
        }
      }
    }

    let v1: string | undefined;
    for (const msTimeString in toTransform) {
      if (v1 == null) {
        v1 = this.syncdoc.to_str();
      }
      const time = new Date(parseInt(msTimeString));
      const v0 = this.syncdoc.version(time)?.to_str();
      if (v0 == null) {
        // TODO: try loading full history or waiting a few seconds, depending on timestamp.
        // it should just work automatically because when everything syncs up loadComments
        // is run again and then this works.
        // console.log("unknonwn document at time:", time);
        continue;
      }
      const marks1 = transformMarks({
        marks: toTransform[msTimeString],
        v0,
        v1,
      });
      for (const mark of marks1) {
        this.setComment({ ...mark, noSave: true });
      }
    }
  };

  initComments = async () => {
    if (
      await redux
        .getProjectActions(this.project_id)
        .path_exists(this.commentsPath())
    ) {
      // initialize database
      await this.getCommentsDB();
    }
    // also periodically save comments out when activity stops
    this.syncdoc.on("change", this.saveCommentsDebounce);
  };

  update = () => {
    if (this.commentsDB == null) {
      return;
    }
    this.loadComments();
  };
}
