# React implementation of task list


## Data structure

A .tasks file is a bunch of JSON lines of the form:
```
{"desc":"test\n\n#foo","position":-1,"last_edited":1513372221897,"task_id":"4a6bd1e6-9d07-4c14-b816-6aa6208113bb"}
{"desc":"another task","position":0,"last_edited":1513373836201,"task_id":"56c06d2e-4b6b-4f98-8ad2-b856081aa433","due_date":1513546634013}
```

That's it.  Syncdb of course full interprets this so you should not have to.  Just think of this
as an immutable.js map from uuid's (task_id) to objects that have the following keys:

   - desc: a string; the markdown task description
   - position: a floating point number; the task custom order is by position
   - last_edited: ms since epoch
   - due_date: optional field with ms since epoch

