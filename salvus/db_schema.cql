CREATE TABLE uuid_value (
     name varchar,
     uuid uuid,
     value varchar,
     PRIMARY KEY(name, uuid)
);

CREATE TABLE key_value (
     name varchar,
     key varchar,
     value varchar,
     PRIMARY KEY(name, key)
);

CREATE TABLE sage_servers (
    address varchar PRIMARY KEY,
    running boolean
);

CREATE INDEX ON sage_servers (running);

CREATE TABLE services (
    service_id uuid PRIMARY KEY,
    name varchar,
    address varchar,
    port int,
    running boolean,
    username varchar,
    pid int,
    monitor_pid int
);

CREATE INDEX ON services (running);

CREATE INDEX ON services (name);

CREATE TABLE status (
    service_id uuid,
    time timestamp,
    pmem float,
    pcpu float,
    cputime float,
    vsize int,
    rss int,
    PRIMARY KEY(service_id, time)
);

CREATE TABLE log (
    service_id uuid,
    time timestamp,
    logfile varchar,
    message varchar,
    PRIMARY KEY(service_id, time)
);

CREATE TABLE plans (
    plan_id      uuid PRIMARY KEY,
    name         varchar,         // name of this plan
    description  varchar,         // text describing this plan
    current      boolean,         // whether or not this plan is currently active
    stateless_exec_limits varchar, // JSON {walltime:seconds, cputime:seconds, vmem:MB, numfiles:int, quota:MB} 
);   

CREATE INDEX ON plans(name)
CREATE INDEX ON plans(current)
                   
CREATE TABLE accounts (
    account_id      uuid PRIMARY KEY,
    username        varchar,
    passwd_hash     varchar,
    email           varchar,
    email_hash      varchar,
    plan_id         uuid,
    plan_starttime  timestamp,
);    
    
CREATE INDEX ON accounts(username)
CREATE INDEX ON accounts(email)
CREATE INDEX ON accounts(email_hash)
CREATE INDEX ON accounts(plan_id)
    
CREATE TABLE account_events (
    account_id   uuid PRIMARY KEY,
    event        varchar,
    value        varchar
);    

CREATE TABLE auths (
    account_id   uuid,
    provider     varchar,   
    login_name   varchar,   
    info         varchar,
    PRIMARY KEY(account_id, provider, login_name)
);
