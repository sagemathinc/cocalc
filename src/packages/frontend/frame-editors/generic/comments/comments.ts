import { delay } from "awaiting";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { redux } from "@cocalc/frontend/app-framework";
import { debounce } from "lodash";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import type { SyncDoc } from "@cocalc/sync/editor/generic/sync-doc";
import { aux_file, hash_string } from "@cocalc/util/misc";
import { once } from "@cocalc/util/async-utils";
import type { Doc } from "codemirror";
import { transformComments } from "./transform";
import { getLocation } from "./util";
import type { Comment, Location } from "./types";
import DB from "./db";
import { generate } from "randomstring";

const DEBOUNCE_MS = 500;

const MARK_OPTIONS = {
  shared: true,
  clearWhenEmpty: false,
  inclusiveRight: true,
};

export class Comments {
  private syncdoc: SyncDoc;
  private project_id: string;
  private path: string;
  private getDoc: () => Doc | null;
  private commentsDB?: SyncDoc;
  private db: DB;

  constructor({ getDoc, path, project_id, syncdoc }) {
    this.getDoc = getDoc;
    this.path = path;
    this.project_id = project_id;
    this.syncdoc = syncdoc;
    this.db = new DB(this.getCommentsDB);
    this.init();
  }

  update = async () => {
    if (this.commentsDB == null) {
      return;
    }
    await this.loadComments();
  };

  create = async ({ loc }) => {
    // start with 4-character random id, so have enough entropy that
    // collisions between different clients generating a new id at
    // once is highly unlikely
    let n = 4;
    let k = 0;
    while (true) {
      const id = generate(n);
      if (!(await this.db.has(id))) {
        await this.set({ id, loc });
        return id;
      }
      k += 1;
      if (k >= 5) {
        // extremely unlikely, but just in case
        n += 1;
      }
    }
  };

  // Create or edit an existing comment.
  // - You *CANNOT* change the loc of an existing comment -- it's gets updated
  //   only in response to the document changing.
  set = async ({
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
    // console.log("set", { id, loc });
    const doc = this.getDoc();
    if (doc == null) {
      // just set in db directly.
      const comment = await this.db.get_one(id);
      if (comment != null) {
        // already in db
        if (!!comment.done == !!done) {
          // nothing changed
        } else {
          this.db.set({ id, done });
          if (!noSave) {
            await this.db.save();
          }
        }
        return;
      }
      if (loc == null) {
        throw Error("unable to find mark");
      }
      const created = this.syncdoc.newest_patch_time()?.valueOf();
      this.db.set({ id, created, time: created, loc, done });
      if (!noSave) {
        await this.db.save();
      }
      return;
    }
    for (const mark of doc.getAllMarks()) {
      if (mark.attributes?.style == id) {
        // the mark is already in the document -- the only thing we may
        // need to do is change the done status for that mark.
        const comment = markToComment(mark);
        if (!!comment.done == !!done) {
          // nothing to do
          return;
        }
        if (loc == null) {
          // also locate it
          const loc1 = getLocation(mark);
          if (loc1 != null) {
            // @ts-ignore
            loc = loc1;
          }
        } else {
          // mark exists and you're explicitly trying to set loc; shouldn't be doing that.
          // only thing you can do is change done status.
          throw Error(
            `do not try to set the location of an already exisiting comment -- id ${id}`,
          );
        }
        // Overwriting existing mark, so remove current one (gets created again below)
        // I think there is no way to edit a mark without just removing and adding it (?).
        mark.clear();
        break;
      }
    }
    if (loc == null) {
      throw Error("unable to find mark");
    }
    // create the mark
    // console.log("markText", { id, loc });
    doc.markText(loc.from, loc.to, {
      ...MARK_OPTIONS,
      css: done ? "" : "background:#fef2cd",
      attributes: { style: id },
    });
    if (!noSave) {
      this.syncCommentsDebounce();
    }
  };

  // Return most up to date info about given comment.
  get_one = async (id: string) => {
    const doc = this.getDoc();
    let comment = await this.db.get_one(id);
    if (comment == null) {
      return undefined;
    }
    if (doc != null) {
      for (const mark of doc.getAllMarks()) {
        if (mark.attributes?.style == id) {
          // found it!
          comment = { ...comment, ...markToComment(mark) };
          break;
        }
      }
    }
    delete comment.hash;
    delete comment.time;
    return comment;
  };

  get = async () => {
    const x = this.getComments() ?? (await this.db.get()) ?? [];
    // we use the database instead
    return x.map((y) => {
      delete y.hash;
      delete y.time;
      return y;
    });
    // TODO: y.created may be missing, but probably needed!
    // maybe can store it in the CM Mark somehow?
  };

  select = (id) => {
    const doc = this.getDoc();
    if (!doc) {
      return null;
    }
    for (const mark of doc.getAllMarks()) {
      if (mark.attributes?.style == id) {
        setMarkColor({ mark, doc, color: "#fbbd04" });
      } else if (mark.css == "background:#fbbd04" && mark.attributes?.style) {
        setMarkColor({ mark, doc, color: "#fef2cd" });
      }
    }
  };

  private init = async () => {
    if (
      await redux
        .getProjectActions(this.project_id)
        .path_exists(this.commentsPath())
    ) {
      // initialize database
      await this.getCommentsDB();
    }
    // also periodically save comments out when activity stops
    this.syncdoc.on("change", this.syncCommentsDebounce);
  };

  private getComments = (): Comment[] | null => {
    const doc = this.getDoc();
    if (!doc) {
      return null;
    }
    const time = this.syncdoc.newest_patch_time()?.valueOf();
    const hash = this.syncdoc.hash_of_live_version();
    return doc
      .getAllMarks()
      .filter((mark) => mark.attributes?.style)
      .map((mark) => markToComment(mark, hash, time));
  };

  private getCommentsMap = (): { [id: string]: Comment } => {
    const v: { [id: string]: Comment } = {};
    for (const comment of this.getComments() ?? []) {
      v[comment.id] = comment;
    }
    return v;
  };

  private commentsPath = () => {
    return aux_file(this.path, "comments");
  };

  private getCommentsDB = reuseInFlight(async () => {
    if (this.commentsDB == null) {
      const commentsDB = await webapp_client.sync_client.sync_db({
        project_id: this.project_id,
        path: this.commentsPath(),
        primary_keys: ["i"],
        ephemeral: true,
        cursors: true,
      });
      this.syncdoc.on("close", () => {
        commentsDB?.close();
      });
      commentsDB.on(
        "change",
        debounce(
          () => {
            this.loadComments();
          },
          DEBOUNCE_MS,
          { leading: true, trailing: true },
        ),
      );
      if (commentsDB.get_state() != "ready") {
        await once(commentsDB, "ready");
      }
      this.commentsDB = commentsDB;
    }
    return this.commentsDB;
  });

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
    let changes = false;
    for (const comment of comments) {
      const cur = await this.db.get_one(comment.id);
      if (cur?.time != null && cur.time > (comment.time ?? 0)) {
        // there is already a newer version
        continue;
      }
      if (cur == null) {
        comment.created = comment.time;
      }
      changes = true;
      await this.db.set(comment);
    }
    if (changes) {
      await this.db.save();
    }
  });

  sync = reuseInFlight(async () => {
    await this.saveComments();
    await this.loadComments();
  });

  private syncCommentsDebounce = debounce(this.sync, DEBOUNCE_MS);

  private loadComments = async () => {
    const doc = this.getDoc();
    if (doc == null) {
      return;
    }
    // get current version of document *not* from syncdoc from actual editor,
    // since there obviously can be a delay, e.g., this.syncdoc.hash_of_live_version()
    // can't possibly always be the same as this, since we don't save editor to
    // syncstring on every keystroke (as that would make the UI laggy).
    const v1 = doc.getValue();
    const hash = hash_string(v1);
    const toTransform: { [time: string]: Comment[] } = {};
    const curComments = this.getCommentsMap();
    for (const comment of await this.db.get()) {
      // we only require the hash to match, not the time, because
      // e.g., imagine a jupyter notebook with lots of cells -- the
      // time of last change could be old.  Just matching the hash
      // has a VERY, VERY small chance of being wrong, but is much
      // more flexible/powerful/etc. For annotations this is the
      // right tradeoff.
      const cur = curComments[comment.id];
      if (cur != null) {
        // this comment is ALREADY in our document -- the only allowed change is "done".
        if (!!cur.done != !!comment.done) {
          await this.set({ id: comment.id, done: comment.done, noSave: true });
        }
        continue;
      }

      if (comment.hash == hash) {
        try {
          await this.set({ ...comment, noSave: true });
        } catch (err) {
          console.warn("Deleting invalid comment", comment);
          // can't set - shouldn't be fatal.
          // delete from DB to avoid wasting time in future.
          await this.db.delete(comment.id);
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

    for (const msTimeString in toTransform) {
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
        await this.set({ ...comment, noSave: true });
      }
    }
  };
}

function markToComment(mark, hash?, time?) {
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
}

function setMarkColor({ mark, doc, color }) {
  const loc = getLocation(mark);
  if (loc == null) {
    return;
  }
  doc.markText(loc.from, loc.to, {
    ...MARK_OPTIONS,
    css: mark.done ? "" : `background:${color}`,
    attributes: mark.attributes,
  });
  mark.clear();
}
