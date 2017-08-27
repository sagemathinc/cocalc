# Frontend Testing checklist

We will make all these tests be automated eventually. For now, at least figure out what tests we want to do by listing them and doing them by hand

## Not logged in

### Landing page
- open page while not logged in (say private browsing mode) and ensure that landing page appears
  * the root page should show up if you aren't signed in and you do not have a `has_remember_me` cookie or its value isn't `true`.
  * landing page is mainly for creating an account or signing in
- click "Forgot password" and see a dialog
- click "Sign in" and get "empty email address" error
- put in a random bogus account and get ""no such account" error.
- put in an account email without the "@" symbol. Get a "Please include an @" Error message.
- click "Terms of service" link and see the terms of service in a new tab
- click links at footer and check that they work
- click "other policies" and see all policies
- back on sign up page, leave all input boxes blank and click "Sign up!" (why isn't the sign up button disabled until it can be clicked?!) and get errors for each input box.

### Help page
- click "Help" and check that all links under "Support" work and also open in another new tab
- Verify that Current usage section looks reasonable
- Check all the links under About (work and open in new tab)
- Check everything under "Getting started with CoCalc"

## Logged in

- Click on the connection icon (upper right) and make sure the ping time and "Hub Server" are both displayed.

### Account settings
- change first name and last name and see this change appear at top of page, and also in a collaborator's browser (say in project list)
- change email address
- change password
- systematically change every other setting with another browser open (same user) and note that every setting appears correctly in the other browser.
- click "Confirm: always ask for confirmation before closing the browser window" and ensure that a confirmation really happens (by refreshing)
- after checking "use gravatar", check that the link to wordpress works.
- admin: - change account creation token and create account to verify it works
- site settings: change them all and refresh browser to see changes
- link and unlink your account using each oauth passport provider.
- with account linked, test sign in.

### Billing/Upgrades

- click the billing tab and see stuff
- add a credit card (see https://stripe.com/docs/testing#cards)
- add a subscription and verify that it appears
- see list of upgrades and make sure makes sense
- look at list of projects that have been upgraded and try clicking on them.

### Notifications
- Click the bell and see a list of notifications
- click bell again (or outside box) to make it disappear, then click again to show it
- use the cursor to move up and down the list (scrolling via the cursor is not implemented)
- have more than 40 file use entries and click "show xxx more" to see them
- type in the search box to restrict what is displayed
- hit enter to open a selected document and verify that it works
- edit a file in another browser session and see that it goes to the top of the file notification list showing you as having just edited it.
- edit file you collaborate on but as another user and see that it goes to top of file notification list; (opening isn't enough -- you must edit)
- verify that if one user adds/removes another as a collaborator on a project, the corresponding files notifications on that project appear/disappear for the other user.
- have both users edit the same file (say latex), and confirm that each one's avatar appears at the top right of the file


### Projects
- start creating a new project and cancel
- create a new project.
- set project to hidden and verify on main listing
- set project to deleted and verify on main listing
- unhide project and verify on main listing
- undelete project and verify on main listing
- make sure you have at least two projects, and test that typing "Search for projects..." works
- confirm that collab to last edit a file is properly listed in last column next to projects, e.g,. by editing as another or same user in a project.
-

### Project
- make a new project
- add other user as a collaborator
    - does removing a user work?
    - invitation emails? (requires to have setup sendgrid api keys)
- create files of the following types:
    - sagews worksheet
        - plotting? @interact in sage?
        - also test printing to html
    - jupyter notebook
        - modern jupyter2: default, test executing, do kernels show up, switch between them, ...
        - classical: does switching between modern and classical work?
        - saving as html or pdf works
    - latex document:
        - preview shows up
        - sagetex works
        - forward/inverse search
        - create a `*.rnw` file and test the additional R code processing in latex
    - terminal
    - task list
    - chatroom
    - course: for details, see next section!
    - editor with preview
        - markdown file (.md)
        - `*.rmd` file similar to `*.rnw`
        - media wiki file (.wiki)
        - html file
- verify for each file just created that basic editing works
- verify that sync works (have other user also open all the files and test back and forth):  here there are tons of details about *HOW* to do this to actually test their functionality....

#### Course
- open .course file in a project
- add a student to the course
- verify that a project is created for the student, that the student is a collaborator on that project, and that you are the owner, and that the project is marked hidden.
- go through a fictive assignment:
  - create a folder, add it as an assignment, and have at least one student
  - hand out, check it is in the student's project
  - modify it as a student
  - collect it
  - check you really got the modified file
  - grade it
  - hand out the grade
  - check student got the grade in the grade file

### Files in a project
- show/hide hidden files in listing
- check some boxes; shift-check to get a range
- check all/uncheck all
- check all and compress
- type something in the file listing find box and see listing restricted properly; hit enter to open first hit
- type a command in the miniterm
- click refresh button above miniterm
- browsing into subdirectories then click home icon at top to go to top (and other subpaths)
- backups should show the ~/.snapshots directory, but otherwise not work on the dev machine right now.
- click a checkbox next to a file and download it, rename it, move it, copy it, share it.  (note: download basically only works with the link)
- for sharing publicly, make sure the public label appears (and also disappears when stop sharing)
- use the other user to try viewing a file that they don't have access to, then make it public, then try again.  Make sure browsing the directory tree as a public user works and shows public files/directories only.
- make sure the project title is properly displayed when viewing public page (not just loading)

### Publishing
- publish e.g. a sagews or ipynb file
- check it shows up in private/incognito browsing mode
- check you can download it

### Log in a project
Click the Log button to bring up the log
- test searching
- hit enter to open first selected log entry
- (CURSOR does not work yet for log -- not implemented)
- make enough log entries then test page

### Find in files
- do a search
- click the "navigate to a different folder" link
- click a filename in search results to see result (doesn't move to corresponding line yet)
- click "using grep..."
- enable each checkbox on the right and re-search

### Project settings
- change project title/settings and see that the change appears on the main projects list and also in the list, etc. for different user with same project open
- restart project server, stop it, and save it.
- click "ssh into your project..." (and also test the link to open authorized_keys)
- click to restart sage worksheet server
- adjust all quotas

### Misc
I (hsy) picked this up in a dev project, originally written by Tim

* terminal
  * copy and paste with CTRL-C/CTRL-V [broken on test]
  * up and down arrows
  * color
    ```
    RED='\033[0;31m'
NC='\033[0m' # No Color
printf "I ${RED}love${NC} Stack Overflow\n"
```
  * tab completion: typing `sag` and then hitting TAB should result in `sage`
  * try terminal over time, for example I quickly realized that a terminal was breaking and giving `{"event":"error","id":"7c06e62f-8ec7-4a76-a6d7-567cbadf8bcc","error":"no response"}` and don't get this in production
  * name of the terminal file to the right of "initialization file" icon [test.sagemath.com just shows ~]  [[wstein: no -- it should only show the terminal title, which is the current directory; the filename is in the tab.  This is correct.]]
  * resize the browser window the terminal should adapt and adapt again when resized [does not work on cloud/test]
  * hit small A makes fonts smaller
  * hit big A makes fonts bigger
  * Refresh refreshes if blank
  * Pause/Play: type `python ENTER` `for i in range(500000): print i` press pause you should see output stop and press play you should see it continue warning computer may become very slow
  * Clicking "Copyable history" should show dialog box with
  * Clicking init file icon should open a .term.init file
* chat
  * clicking a SMC link in a chat should open a new SMC tab not a new browser tab [broken on test]

