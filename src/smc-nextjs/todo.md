# Todo

### Top priority -- first release

This is what we need for functional equivalence with existing share server:

- [x] make the public paths in the all page look "actually readable" using antd
- [x] ability to click on a public path and have it open the right url
- [x] development is basically impossible due to https://github.com/vercel/next.js/issues/14997 and https://github.com/vercel/next.js/issues/12735.  This is obviously a recent really stupid move by the next.js devs due to them only using vscode, and not putting in the work to figure this out (like I already did with cocalc).
- [ ] display a specific path:
  - [x] number of views
    - [x] increment the view counter
  - [ ] open with one click link; env variable and function to make the url...
  - [x]  directory listing
  - [ ] document
    - [ ] #hard static smc-webapp rendered view of the document
    - [ ] download a single document
    - [ ] raw view of document
    - [ ] embed version of document (with backward compat redirect)
    - [x] showing license
    - [x] long description
    - [x] compute environment
    - [x] name and link to author of document
- [ ] page with info about a user.  But what?
- [x] box to search the share server using google
- [ ] google analytics: just need to copy some functions from `share/base-page.tsx`
- [x] the back button doesn't work robustly, which is really disturbing!
  - Might be [this](https://github.com/vercel/next.js/issues/7091)? nope.
  - maybe [this](https://github.com/vercel/next.js/issues/9989)? nope.
  - deleting the index.jsx page entirely... seems to get rid of the problem (causing a page refresh on back button, which is fine).

Plan to get all the above **functionally working** with absolutely minimal care about style or look.  It just needs to be basically functional but with _good code._  Only then worry about style.

Biggest challenges are: (1) **no coffeescript** so we might have to rewrite chunks of existing code in typescript, and (2) things that are tricky to render via next.js such as math formulas or anything trying to use jsdom or jquery (???).

### Optimizations and cleanup

- [ ]  In `pages/public_paths/[id].tsx`  we could pre-render the top N most popular pages...
- [ ] is the token field in `public_paths`  used at all?
- [ ] unlisted users -- need to add to cocalc account prefs that unlisted also means that user will not be mentioned anywhere publicly (e.g., on the share server).
- [ ] right now we have no index.jsx due to the back button bug.  So user has to know to go to /home...

---

.

### Nice things to plan for later

- [ ] ability to name public path so get a nice url
- [ ] implement redirect so old url schema works
- [ ] I disabled checks for  src/scripts/check\_npm\_packages.py of smc-nextjs, since we're truly using different package versions that (only overlapping codebase eventually in some react components).   Maybe at some point re-enable this.
