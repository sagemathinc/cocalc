# Sage Server

Functionality:

- keep track of list of running sage processes, with some info about them (total memory, time)
- write that list periodically to somewhere in the database (about this project), so can be shown to users
- start a sage process
- stop/kill a sage process
- interrupt a sage process
- evaluate a block of code (with data) and push out results as they appear
- maintain queue of evaluation requests
- if sage server likely to be started (based on previous _usage_ of this project), start it right when project starts up
