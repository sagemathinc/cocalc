# Todo

### Top priority -- first release

This is what we need for functional equivalence with existing share server:

- [x] make the public paths in the all page look "actually readable" using antd
- [ ] ability to click on a public path and have it open the right url
- [ ] display a specific path:
  - [ ] number of views
    - [ ] increment the view counter
  - [ ] open with one click button
  - [ ] directory listing
  - [ ] document
    - [ ] #hard static smc-webapp rendered view of the document
    - [ ] download a single document
    - [ ] raw view of document
    - [ ] embed version of document
    - [ ] showing license
    - [ ] long description
    - [ ] compute environment
    - [ ] name and link to author of document
- [ ] page with info about an author 
- [ ] button to search the share server using google
- [ ] google analytics

Plan to get all the above **functionally working** with absolutely minimal care about style or look.  It just needs to be basically functional but with _good code._  Only then worry about style.

Biggest challenges are: (1) **no coffeescript** so we might have to rewrite chunks of existing code in typescript, and (2) things that are tricky to render via next.js such as math formulas or anything trying to use jsdom or jquery (???).

.

---

.

### Nice things to plan for later

- [ ] ability to name public path so get a nice url
- [ ] implement redirect so old url schema works
- [ ] I disabled checks for  src/scripts/check\_npm\_packages.py of smc-nextjs, since we're truly using different package versions that (only overlapping codebase eventually in some react components).   Maybe at some point re-enable this.
