/*
URI fragments

The different types are inspired by https://en.wikipedia.org/wiki/URI_fragment
*/

// a specific line in a document
interface Line {
  line: number;
}

// an id of an element or cell, e.g., in a whiteboard or Jupyter notebook.
// These ids are assumed globally unique, so no page is specified.
interface Id {
  id: string;
}

// a specific page in a document, but where no line or element in that page is specified.
interface Page {
  page: string;
}

type FragmentId = Line | Id | Page;

namespace FragmentId {
  export function set(fragmentId: FragmentId): void {
    const v: string[] = [];
    for (const key in fragmentId) {
      v.push(`${key}=${fragmentId[key]}`);
    }
    location.hash = v.join("&");
  }

  export function get(): FragmentId {
    const fragmentId: any = {};
    for (const x of location.hash.split("&")) {
      const v = x.split("=");
      if (v.length == 2) {
        fragmentId[v[0]] = v[1];
      }
    }
    return fragmentId as FragmentId;
  }

  export function clear() {
    location.hash = "";
  }
}

export default FragmentId;
