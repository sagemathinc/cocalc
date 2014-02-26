# Storage3 -- the final storage system.


## Structure

 - online:

     - a zpool sitting on a single ephemeral image file that contains a ZFS filesystem project-project_id that contains (not compressed, not deduped):
          - one or more sparse image files that together forms a ZFS pool (compressed and deduped)
              - that pool has one filesystem mounted as /projects/project_id that may have a huge number of snapshots

 - offline: a collection of ZFS streams that allow us to reconstruct the above efficiently

## Storage

 - longterm:
     - a sequence of lz4 compressed zfs streams that together defines the zfs filesystem project-project_id, stored as records in cassandra db

 - short term:
     - a sequence of lz4 compressed zfs streams that together defines the zfs filesystem project-project_id, stored in a directory "/images" (?) on the filesystem of at least 2 hosts in each data center, determined by consistent hashing


## Operations

 - create

 - mount

 - replicate

 - store to db

 - recompact: replace large number of streams by smaller number

 - increase quota

 - snapshot

## Database schema

keyspace: 'projects'
set replication factor of 2
login: projects; a random password

    CREATE TABLE images (
        project_id uuid  PRIMARY KEY,
        start      timestamp, // undefined = first stream
        end        timestamp,
        stream     blob,
        number     int        // if we split stream from snap0 to snap1 into multiple db entries
    );


