import { delay } from "awaiting";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { redux } from "@cocalc/frontend/app-framework";
import { debounce } from "lodash";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import type { SyncDoc } from "@cocalc/sync/editor/generic/sync-doc";
import { aux_file } from "@cocalc/util/misc";
import { once } from "@cocalc/util/async-utils";
import type { Doc } from "codemirror";
import { transformComments } from "./transform";
import { getLocation, toComment, toCompactComment } from "./util";
import type { Comment, Location } from "./types";

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
    loc,
    done,
    noSave,
  }: {
    id: string;
    loc?: Location;
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
        if (loc == null) {
          // also locate it
          const loc1 = getLocation(mark);
          if (loc1 != null) {
            // @ts-ignore
            loc = loc1;
          }
        }
        // overwriting existing mark, so remove that one (gets created again below)
        mark.clear();
      }
    }
    if (loc == null) {
      throw Error("unable to find mark");
    }
    // create the mark
    doc.markText(loc.from, loc.to, {
      css: done ? "" : "background:#fef2cd",
      shared: true,
      attributes: { style: id },
      clearWhenEmpty: false,
    });
    if (!noSave) {
      this.saveCommentsDebounce();
    }
  };

  private getComments = (): Comment[] | null => {
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
        const loc = getLocation(mark)!;
        return {
          id,
          time,
          hash,
          done,
          loc,
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
        primary_keys: ["i"],
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
      const cur = await this.dbGetComment(comment.id);
      if (cur?.time != null && cur.time >= (comment.time ?? 0)) {
        // there is already a newer version
        continue;
      }
      if (cur == null) {
        comment.created = comment.time;
      }
      changes = true;
      await this.dbSetComment(comment);
    }
    if (changes) {
      // save to disk is important since comments syncdb is ephemeral
      await db.save_to_disk();
    }
  });

  private dbGetAll = async (): Promise<Comment[]> => {
    const db = await this.getCommentsDB();
    const v: Comment[] = [];
    for (const immutableCompactComment of db.get()) {
      v.push(toComment(immutableCompactComment.toJS()));
    }
    return v;
  };

  private dbGetComment = async (id: string): Promise<Comment | undefined> => {
    const db = await this.getCommentsDB();
    const x = db.get_one({ i: id });
    if (x == null) {
      return undefined;
    }
    return toComment(x.toJS());
  };

  private dbSetComment = async (comment: Comment) => {
    const db = await this.getCommentsDB();
    db.set(toCompactComment(comment));
  };

  private dbDeleteComment = async (id: string) => {
    const db = await this.getCommentsDB();
    db.delete({ i: id });
  };

  private saveCommentsDebounce = debounce(this.saveComments, 3000);

  loadComments = async () => {
    const doc = this.getDoc();
    if (doc == null) {
      return;
    }
    const hash = this.syncdoc.hash_of_live_version();
    const toTransform: { [time: string]: Comment[] } = {};
    for (const comment of await this.dbGetAll()) {
      if (comment.hash == hash) {
        try {
          this.setComment({ ...comment, noSave: true });
        } catch (err) {
          console.warn("Deleting invalid comment", comment);
          // can't set - shouldn't be fatal.
          // delete from DB to avoid wasting time in future.
          await this.dbDeleteComment(comment.id);
        }
      } else {
        const time = `${comment.time}`;
        if (toTransform[time] == null) {
          toTransform[time] = [comment];
        } else {
          toTransform[time].push(comment);
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
      const comments1 = transformComments({
        comments: toTransform[msTimeString],
        v0,
        v1,
      });
      for (const comment of comments1) {
        this.setComment({ ...comment, noSave: true });
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
