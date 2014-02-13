# *Implementing* Business Models Ideas for SMC

The point of this document is to list various proposed business models, then try to figure out exactly what is involved in implementing them and how long it would take.  That's it.

## Parameters

There are many parameters...

- [ ] storing limits how?
    -- limits for each user could be stored in the accounts table in a mapping called "limits".
      - What happens when a given "plan" changes? Do I run through the whole database and update all limits maps?  That doesn't scale well and could lead to problems.
    -- could have a table called "plans", with columns:
            plan_id    name      description     {public_projects:?, private_projects:?, publishing:?, total_ram:?, ...}
       and a pointer to a `plan_id` in the accounts table.  (I think I already did this.)
       Code would then cache the plans in memory (for a while), which reduces the db hits when doing operations a *lot*.
       This means users have to have plans rather than directly paying for changing specific limits.  It's not clear
       which is the better approach.   It's the old cell phone thing of "pay for what you use" versus "buy a contract/plan".
       Pay as you go is generally considered more consumer friendly, but is I guess harder to implement technically
       and possibly less predictable revenue wise.

- [ ] (1:30?) number of public/private projects
  - [ ] (0:45?) cassandra -- when creating a new project check the number of projects the account owns.  If it exceeds the limit, return an error instead of creating the project.
  - [ ] (0:45?) display an error message in the client, with link to page about how to increase limits.

- [ ] (6:00?) publishing content publicly -- let's say a "worksheet" to fix ideas.
  - [ ] (1:00?) If client tries to access a path into *public* project and the file is *world-readable*, then they are granted read-only document access, using what I already implemented.  blobs are automatically just served (so images).
  - [ ] (2:00?) Make it easier in the UI to tell whether or not a directory is world readable and/or set it to be world-readable.  For example, have a share button, which (1) changes permissions, and (2) provides the url to the most recent snapshot (possibly making a new one).
  - [ ] (3:00?) Optimization: Any time somebody views this document, it would have to start the project using current code, which is BAD.  However, I can easily modify code so that for grabbing a document that will be read-only, instead of starting all the server stuff, we just mount the ZFS filesystem (if not mounted), and directly grab the file via scp (say) or NFS or even something unencrypted, which is much more lightweight.   Or maybe we only start the local hub and nothing else (no sage server, console server, etc.).

- [ ] total memory/cpu/network/disk speed usage by a project
   - [ ] (3:00?) when starting a project have option to create a new cgroup for that user (modify my create_project_user.py script)
   - [ ] (1:00?) store project memory/cpu limit in projects table entry.
   - [ ] (1:00?) pass in parameters to the script, which we get from the database
   - [ ] (1:00?) code ui to modify these parameters for a given project

- [ ] disk space available to a project
   - [ ] (1:00?) store in database
   - [ ] (1:00?) have a function in storage that updates quota in all zfs replicas and in database.
   - [ ] (2:30?) what do we do if a replica isn't available -- need a queue of updates, which gets checked periodically.

- [ ] number of snapshots
   - [ ] (1:00?) have a maximum number of snapshots as a parameter for a project in the database
   - [ ] (3:00?) when that number is exceeded, what do we do?  apply a heuristic to trim?  Just take only the most recent snapshots?  what about connection with publication?

- [ ] number of collaborators in a project
   - [ ] (1:00?) decide -- fixed limit as part of project or plan?  If plan, what if the user changes plan?
   - [ ] (1:00?) check when adding collaborators.
   - [ ] (1:00?) ui message if limit exceeded.

- [ ] amount of unused time until project is forcefully closes
   - [ ] (1:00?) implement as parameter in database (as a number not yes/no)
   - [ ] (1:00?) should also be displayed in project settings with "email me" link.
   - [ ] (1:30?) use number in code instead of having it be '6 hours' (say).


## Features

- [ ] (1 week) homework grading workflow
   - very strong interest

- [ ] (1 week) management tools for teaching a class: create accounts for students, send them emails, etc.
   - very strong interest

- [ ] (???) a group of users get access to a specific commercial sotware install (e.g., Mathematics, Magma, etc.)
   - significant interest

- [ ] port forwarding
   - some interest

- [ ] dedicated database hosted as part of SMC: a cassandra keyspace (?).  Most users don't know much or anything about DB's.  Need a simple API.
   - nobody ever requests this in practice

- [ ] attach large amounts of disk space to a project via NFS, maybe even shared across several projects
   - nobody ever requests this in practice

