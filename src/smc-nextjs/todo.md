# Todo

Today's big goal:

- [ ] get smc-nextjs + codemirror lerna package to work together
- [ ] restructure into codemirror-core and codemirror-static 
- [ ] understand _scoped_ organizations -- package names should be maybe `@cocalc/codemirror-core` and `@cocalc/codemirror-static` etc.  
- [ ] then get smc-webapp to use new codemirror lerna package and codemirror-static and work...
- [ ] worry about how this impacts our normal build process... 

### Top priority -- first release

This is what we need for functional equivalence with existing share server:

- [x] make the public paths in the all page look "actually readable" using antd
- [x] ability to click on a public path and have it open the right url
- [x] development is basically impossible due to https://github.com/vercel/next.js/issues/14997 and https://github.com/vercel/next.js/issues/12735.  This is obviously a recent really stupid move by the next.js devs due to them only using vscode, and not putting in the work to figure this out (like I already did with cocalc).
- [ ] display a specific path:
  - [x] number of views
    - [x] increment the view counter
  - [x] open in cocalc link; env variable and function to make the url...  
    [https://cocalc.com/107dcdce-4222-41a7-88a1-7652e29c1159/port/54145/app?anonymous=true&amp;launch=share/fc974f7e93cc44cd3c0df7fd413e565a896e817d/issue-5212/a.png](https://cocalc.com/107dcdce-4222-41a7-88a1-7652e29c1159/port/54145/app?anonymous=true&launch=share/fc974f7e93cc44cd3c0df7fd413e565a896e817d/issue-5212/a.png)
  - [x]  directory listing
  - virtual hosts: porting this over `smc-hub/share/virtual-hosts.ts`
  - [ ] document
    - [x] static smc-webapp rendered view of the document; currently in `smc-webapp/share/file-contents.tsx`
      - need to use https://nextjs.org/docs/advanced-features/custom-server to incorporate the raw server via express, since raw server is needed, but impossible in next.js.
        - [x] get it to server static files properly
        - [x] can we fix the / issue (i.e., that if next serves /, then back button breaks)?
        - [x] security
        - [x] images in directories work  but single alone images don't
      - [x] codemirror for code
      - [x] audio
      - [x] video
      - [x] markdown
      - [ ] sage worksheet
        - be sure to test image display, which grabs blobs from db
      - [ ] jupyter notebook
    - [x] download  document
    - [x] raw view of document
    - [x] embed version of document
    - [x] showing license
    - [x] long description
    - [x] compute environment
    - [x] name and link to author of document
- [x] browser raw directory listings
- [x] box to search the share server using google
- [x] google analytics: just need to copy some functions from `share/base-page.tsx`
- [x] the back button doesn't work robustly, which is really disturbing!
  - Might be [this](https://github.com/vercel/next.js/issues/7091)? nope.
  - maybe [this](https://github.com/vercel/next.js/issues/9989)? nope.
  - deleting the index.jsx page entirely... seems to get rid of the problem (causing a page refresh on back button, which is fine).

Plan to get all the above **functionally working** with absolutely minimal care about style or look.  It just needs to be basically functional but with _good code._  Only then worry about style.

Biggest challenges are: (1) **no coffeescript** so we might have to rewrite chunks of existing code in typescript, and (2) things that are tricky to render via next.js such as math formulas or anything trying to use jsdom or jquery (???).

### Optimizations and cleanup

- [ ] make the [update.sh](http://update.sh) script pull from a _specific_ commit -- then there will be no way to accidentally break the share server.   
- [x] #security  worry more about ".." in path and access to raw shares.
- [x] LRU cache in lib/server/serve-raw-path.js
- [ ] page with info about a user.  But what?  How about a list of all projects with public paths that they "collaborate on"; maybe something just with the files they actually touched (?).
- [ ] directory listing within a share could really use a client-side search...
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

## Other

inotify:

```sh
cocalc@kucalc-prod3-node-eara:~$ sudo su
root@kucalc-prod3-node-eara:/home/cocalc# more /proc/sys/fs/inotify/max_user_watches
8192
root@kucalc-prod3-node-eara:/home/cocalc# echo fs.inotify.max_user_watches=80000 | sudo tee -a /etc/sysctl.conf && sudo sysctl -p
fs.inotify.max_user_watches=80000
fs.inotify.max_user_watches = 80000
root@kucalc-prod3-node-eara:/home/cocalc# more /proc/sys/fs/inotify/max_user_watches
80000
root@kucalc-prod3-node-eara:/home/cocalc# sysctl -a|grep inotify
fs.inotify.max_queued_events = 16384
fs.inotify.max_user_instances = 128
fs.inotify.max_user_watches = 80000
user.max_inotify_instances = 128
user.max_inotify_watches = 80000
root@kucalc-prod3-node-eara:/home/cocalc#
```
