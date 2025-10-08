import { DiffMatchPatch, type PatchObject } from "@cocalc/diff-match-patch";
export { DiffMatchPatch };

export type CompressedPatch = [
  [-1 | 0 | 1, string][],
  number,
  number,
  number,
  number,
][];

const dmp = new DiffMatchPatch();
// computing a diff shouldn't block longer than about 0.2s, though
// due to the structure of the algorithms it can be a little worse.
dmp.diffTimeout = 0.2;

// Here's what a diff-match-patch patch looks like
//
// [{"diffs":[[1,"{\"x\":5,\"y\":3}"]],"start1":0,"start2":0,"length1":0,"length2":13},...]
//

export const diff_main = dmp.diff_main.bind(dmp);
export const patch_make = dmp.patch_make.bind(dmp);

function compress_patch(patch: PatchObject[]): CompressedPatch {
  return patch.map((p) => [p.diffs, p.start1, p.start2, p.length1, p.length2]);
}

function decompress_patch(patch: CompressedPatch): PatchObject[] {
  return patch.map((p) => ({
    diffs: p[0],
    start1: p[1],
    start2: p[2],
    length1: p[3],
    length2: p[4],
  }));
}

// return *a* compressed patch that transforms string s0 into string s1.
export function make_patch(s0: string, s1: string): CompressedPatch {
  // @ts-ignore
  return compress_patch(dmp.patch_make(s0, s1));
}

// apply a compressed patch to a string.
// Returns the result *and* whether or not the patch applied cleanly.
export function apply_patch(
  patch: CompressedPatch,
  s: string,
): [string, boolean] {
  let x;
  try {
    x = dmp.patch_apply(decompress_patch(patch), s);
    //console.log('patch_apply ', misc.to_json(decompress_patch(patch)), x)
  } catch (err) {
    // If a patch is so corrupted it can't be parsed -- e.g., due to a bug in SMC -- we at least
    // want to make application the identity map (i.e., "best effort"), so
    // the document isn't completely unreadable!
    console.warn(`apply_patch -- ${err}, ${JSON.stringify(patch)}`);
    return [s, false];
  }
  let clean = true;
  for (const a of x[1]) {
    if (!a) {
      clean = false;
      break;
    }
  }
  return [x[0], clean];
}

// Do a 3-way **string** merge by computing patch that transforms
// base to remote, then applying that patch to local.
export function three_way_merge(opts: {
  base: string;
  local: string;
  remote: string;
}): string {
  if (opts.base === opts.remote) {
    // trivial special case...
    return opts.local;
  }
  // @ts-ignore
  return dmp.patch_apply(dmp.patch_make(opts.base, opts.remote), opts.local)[0];
}
