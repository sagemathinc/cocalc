import { client_db } from "@cocalc/util/db-schema/client-db";

export async function getSyncDocType({
  client,
  project_id,
  path,
}): Promise<{ type: "db" | "string"; opts?: any }> {
  // instead of just "querying the db" (i.e., conat in this case),
  // we create the synctable.  This avoids race conditions, since we
  // can wait until data is written, and also abstracts away the
  // internal structure.
  let syncdocs;
  try {
    const string_id = client_db.sha1(project_id, path);
    syncdocs = await client.synctable_conat(
      { syncstrings: [{ project_id, path, string_id, doctype: null }] },
      {
        stream: false,
        atomic: false,
        immutable: false,
      },
    );
    let s = syncdocs.get_one();
    if (s?.doctype == null) {
      // wait until there is a syncstring and its doctype is set:
      await syncdocs.wait(() => {
        s = syncdocs.get_one();
        return s?.doctype != null;
      }, 10);
    }
    let doctype;
    try {
      doctype = JSON.parse(s.doctype);
    } catch (err) {
      console.warn("malformed doctype", err);
      doctype = { type: "string" };
    }
    if (doctype.type !== "db" && doctype.type !== "string") {
      // ensure valid type
      console.warn("invalid docstype", doctype.type);
      doctype.type = "string";
    }
    return doctype;
  } finally {
    // be sure to close this no matter what, since no value in watching changes.
    syncdocs?.close();
  }
}
