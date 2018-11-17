const { diff_match_patch } = require("smc-util/dmp");
export const dmp = new diff_match_patch();
dmp.Diff_Timeout = 0.2; // computing a diff won't block longer than about 0.2s

// Here's what a diff-match-patch patch looks like
//
// [{"diffs":[[1,"{\"x\":5,\"y\":3}"]],"start1":0,"start2":0,"length1":0,"length2":13},...]
//

export function compress_patch(patch: any[]): any[] {
  return patch.map(p => [p.diffs, p.start1, p.start2, p.length1, p.length2]);
}

export function decompress_patch(patch: any[]): any[] {
  return patch.map(p => ({
    diffs: p[0],
    start1: p[1],
    start2: p[2],
    length1: p[3],
    length2: p[4]
  }));
}

// return *a* compressed patch that transforms string s0 into string s1.
export function make_patch(s0: string, s1: string): any[] {
  return compress_patch(dmp.patch_make(s0, s1));
}

// apply a compressed patch to a string.
export function apply_patch(patch: any[], s: string): [string, boolean] {
  let x;
  try {
    x = dmp.patch_apply(decompress_patch(patch), s);
    //console.log('patch_apply ', misc.to_json(decompress_patch(patch)), x)
  } catch (err) {
    // If a patch is so corrupted it can't be parsed -- e.g., due to a bug in SMC -- we at least
    // want to make application the identity map (i.e., "best effort"), so
    // the document isn't completely unreadable!
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
}

const { cmp_array } = require("smc-util/misc");

interface P {
  time: Date;
  user_id: string;
}

export function patch_cmp(a: P, b: P): number {
  return cmp_array([a.time.valueOf(), a.user_id], [b.time.valueOf(), b.user_id]);
}

export function time_cmp(a: Date, b: Date): number {
  return a.valueOf() - b.valueOf();
}
