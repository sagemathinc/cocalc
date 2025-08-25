Blobs implementation for CoCalc Lite.

This provides POST upload to /blobs and download from /blobs so the
user of a cocalc lite server can paste images into documents, and
have them be referenced by their sha1 hash.

In cocalc.com they images are stored in the postgresql database.
For CoCalc lite there is no postgresql database, and instead
we store the images in a Conat AKV (async key:value store) with
key the sha1 hash of the file being stored.

TODO: When we implement sync we'll have a separate background tasks to send
such blobs to the relevant main server... or maybe we'll switch to the main
site using conat AKV as well.  We'll see.

This code is a rewrite of:

- @cocalc/hub/servers/app/blobs.ts
- @cocalc/hub/servers/app/blob-upload.ts
