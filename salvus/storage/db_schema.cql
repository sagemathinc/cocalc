/* DEPRECATED -- this was an implementation of basically a dropbox-like distributed filesystem built on Cassandra...

   It worked.  I was going to host projects this way.  Then I decided that it was a
   bad idea, since it didn't really solve the problems we really have.  -- William
*/

/*STORAGE */

/*
  CREATE KEYSPACE storage WITH replication = {'class': 'NetworkTopologyStrategy', 'DC0': '3', 'DC1': '3', 'DC2':'3'};
  ALTER KEYSPACE storage WITH replication = {'class': 'NetworkTopologyStrategy', 'DC0': '3', 'DC1': '3', 'DC2':'3'};

  ALTER KEYSPACE system_auth WITH REPLICATION = {'class' : 'NetworkTopologyStrategy', 'DC0': '3', 'DC1': '3', 'DC2':'3', 'DC3':'3'};

CREATE USER salvus WITH PASSWORD '...'  SUPERUSER;
DROP USER cassandra;
CREATE USER storage_server WITH PASSWORD '...';

*/


/*
  - write this right before storing the object -- delete when object successfully stored.
  - scrub will periodically go through and delete sufficiently old chunks left around from writing records.
  - querying the writing table is an easy way to see what writes are happening right now.
*/
CREATE TABLE storage_writing (
    dummy       boolean,    /* so can do:   select id,name,size from storage_writing where dummy=true    */
    timestamp   timestamp,
    id          uuid,
    name        varchar,
    size        varchar,   /* object size (too big for 32 bit int and bigint+node.js=pain) */
    chunk_size  int,      /* size in bytes that file/object is divided into */
    chunk_ids   list<uuid>,
    PRIMARY KEY (dummy, timestamp, id, name)
);

/* write this once the object is stored. */
CREATE TABLE storage (
    id          uuid,
    name        varchar,
    size        varchar,  /* object size (too big for 32 bit int and bigint+node.js=pain) */
    chunk_size  int,      /* size in bytes that file/object is divided into */
    chunk_ids   list<uuid>,
    PRIMARY KEY (id, name)
);

CREATE TABLE storage_chunks (
    chunk_id    uuid      PRIMARY KEY,
    size        int,      /* size in bytes (32-bit) */
    chunk       blob
);

CREATE TABLE storage_log (
    id          uuid,
    timestamp   timestamp,
    host        varchar,
    compute_id  uuid,        /* id of the compute machine on which which the action was taken */
    action      varchar,
    param       varchar,     /* JSON */
    error       varchar,     /* JSON */
    time_s      float,       /* elapsed time for action */
    PRIMARY KEY (id, timestamp)
);



CREATE TABLE project_state (
    project_id     uuid,
    compute_id     uuid,         /* uuid of the compute VM that is hosting some version of this project */
    sync_streams   timestamp,    /* last time to sync with database */
    recv_streams   timestamp,    /* last recv time */
    send_streams   timestamp,    /* snapshot time of last successful image send */
    import_pool    timestamp,    /* last zpool import; undefined if exported */
    snapshot_pool  timestamp,    /* last time the filsystem in the zpool was snapshotted on this host */
    scrub_pool     timestamp,    /* last time we ran zpool scrub on this pool */
    broken         boolean,      /* set to true of we consider this copy of the project broken: change once fixed */
    PRIMARY KEY    (project_id, compute_id)
);

/* Use this table to get a global view on what projects are on a host, e.g., as a consistency check (when host dies).
   This is basically just a "CREATE INDEX on project_storage(host)", except that it isn't dog slow and useless. */

CREATE TABLE compute_hosts (
    dummy          boolean,      /* localize all data so "select *" is fast (table is very small) */
    compute_id     uuid,         /* random uuid of this particular compute host */
    host           inet,         /* ip address */
    port           int,          /* port of storage server: undefined if down -- set frequently with a ttl */
    up_since       timestamp,    /* time when this host became fully operational; undefined if down -- set frequently with a ttl! */
    health         float,        /* 0 is bad, 1 is good */
    zfs_queue_len  int,          /* zfs ops: first come, first served: is queue is big, mounting even a small project could take a while */
    projects       set<uuid>,    /* projects with data on this compute host */
    PRIMARY KEY (dummy, compute_id)
);

/* TODO: only here for the migration. */
CREATE TABLE project_new (
    project_id  uuid PRIMARY KEY,
    new         boolean,      /* if true, mount and *run* using the new storage format */
);

CREATE INDEX on compute_hosts(host);


GRANT SELECT ON table storage TO storage_server;
GRANT MODIFY ON table storage TO storage_server;
GRANT MODIFY ON table storage_writing TO storage_server;
GRANT SELECT ON table storage_writing TO storage_server;
GRANT MODIFY ON table storage_chunks TO storage_server;
GRANT SELECT ON table storage_chunks TO storage_server;
GRANT SELECT ON table storage_log TO storage_server;
GRANT MODIFY ON table storage_log TO storage_server;
GRANT SELECT ON table project_state  TO storage_server;
GRANT MODIFY ON table project_state  TO storage_server;
GRANT SELECT ON table compute_hosts TO storage_server;
GRANT MODIFY ON table compute_hosts TO storage_server;
GRANT SELECT ON table project_new TO storage_server;
GRANT MODIFY ON table project_new TO storage_server;



