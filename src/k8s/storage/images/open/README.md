Opening a project.

This service watches the database for projects that should be running and
mounted from this storage pool, and ensures the relevant ZFS pool
exists here.   This can either involve creating a new pool, or
grabbing the pool from google cloud storage.

This is a node.js service so that it can respond to whatever is needed
(creating image file, downloading and extracting bup repo) in response
to database changes quickly and in parallel.