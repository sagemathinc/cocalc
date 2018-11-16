let apply_patch, make_patch;
import { diff_match_patch } from "./dmp";
const dmp = new diff_match_patch();
dmp.Diff_Timeout = 0.2; // computing a diff won't block longer than about 0.2s
export { dmp };

const { defaults, required } = misc;

// Here's what a diff-match-patch patch looks like
//
// [{"diffs":[[1,"{\"x\":5,\"y\":3}"]],"start1":0,"start2":0,"length1":0,"length2":13},...]
//
const compress_patch = patch =>
  patch.map(p => [p.diffs, p.start1, p.start2, p.length1, p.length2]);

const decompress_patch = patch =>
  patch.map(p => ({
    diffs: p[0],
    start1: p[1],
    start2: p[2],
    length1: p[3],
    length2: p[4]
  }));

// patch that transforms s0 into s1
let make_patch$1 = (make_patch = function(s0, s1) {
  const p = compress_patch(dmp.patch_make(s0, s1));
  //console.log("make_patch: #{misc.to_json(p)}")
  return p;
});

export { make_patch$1 as make_patch };
let apply_patch$1 = (apply_patch = function(patch, s) {
  let x;
  try {
    x = dmp.patch_apply(decompress_patch(patch), s);
    //console.log('patch_apply ', misc.to_json(decompress_patch(patch)), x)
  } catch (err) {
    // If a patch is so corrupted it can't be parsed -- e.g., due to a bug in SMC -- we at least
    // want to make application the identity map, so the document isn't completely unreadable!
    console.warn(`apply_patch -- ${err}`);
    return [s, false];
  }
  let clean = true;
  for (let a of x[1]) {
    if (!a) {
      clean = false;
      break;
    }
  }
  return [x[0], clean];
});

export { apply_patch$1 as apply_patch };
const patch_cmp = (a, b) =>
  misc.cmp_array([a.time - 0, a.user_id], [b.time - 0, b.user_id]);

const time_cmp = (a, b) => a - b;

// Do a 3-way **string** merge by computing patch that transforms
// base to remote, then applying that patch to local.
export function three_way_merge(opts) {
  opts = defaults(opts, {
    base: required,
    local: required,
    remote: required
  });
  if (opts.base === opts.remote) {
    // trivial special case...
    return opts.local;
  }
  return dmp.patch_apply(dmp.patch_make(opts.base, opts.remote), opts.local)[0];
}
