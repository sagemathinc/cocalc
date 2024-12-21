/*
This is a lightweight wrapper around the SyncDB that actually stores the comment locations.

Key things it does:

- hide any use of immutable.js
- store comments in a *COMPACT FORM* which is what goes over memory/disk/network
- typings

Everything outside of this code can view comments as stored in a non-compact nice
readable form, even though on disk the format is compact and obfuscated looking.

(In the longrun, we may want to do this more generally for other syncdb's rather
than a one-off...)
*/

import { toComment, toCompactComment } from "./util";
import type { Comment } from "./types";

export default class DB {
  private getDB;

  constructor(getDB) {
    this.getDB = getDB;
  }

  save = async () => {
    const db = await this.getDB();
    // save to disk is important since comments syncdb is ephemeral
    await db.save_to_disk();
  };

  get = async (): Promise<Comment[]> => {
    const db = await this.getDB();
    const v: Comment[] = [];
    for (const immutableCompactComment of db.get()) {
      v.push(toComment(immutableCompactComment.toJS()));
    }
    return v;
  };

  get_one = async (id: string): Promise<Comment | undefined> => {
    const db = await this.getDB();
    const x = db.get_one({ i: id });
    if (x == null) {
      return undefined;
    }
    return toComment(x.toJS());
  };

  set = async (comment: Partial<Comment>) => {
    const db = await this.getDB();
    db.set(toCompactComment(comment));
  };

  delete = async (id: string) => {
    const db = await this.getDB();
    db.delete({ i: id });
  };
}
