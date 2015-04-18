## Misc

- docs: http://docs.oracle.com/cd/E37670_01/E37355/html/ol_btrfs.html
- snapshots: http://marc.merlins.org/perso/btrfs/post_2014-03-21_Btrfs-Tips_-How-To-Setup-Netapp-Style-Snapshots.html
- noatime
- various BTRFS tricks: http://marc.merlins.org/perso/btrfs/
- `mount -o compress=lzo`
- dedup: https://github.com/g2p/bedup;  but this one looks way better: https://github.com/markfasheh/duperemove, but had to make a change to the Makefile:
        -LIBRARY_FLAGS += $(hash_LIBS) $(glib_LIBS)
        +LIBRARY_FLAGS += $(hash_LIBS) $(glib_LIBS) -lm
- could switch to replicate with send/recv instead of rsync... if volumes are lightweight enough

## Setup:

    apt-get install btrfs-tools


## Make a filesystem ([docs](http://docs.oracle.com/cd/E37670_01/E37355/html/ol_create_btrfs.html))

    mkfs.btrfs -L test -m single /dev/sdb

Benchmarks:

    dd bs=1M count=256 if=/dev/zero of=test conv=fdatasync

    fio --randrepeat=1 --ioengine=libaio --direct=1 --gtod_reduce=1 --name=test --filename=test --bs=4k --iodepth=64 --size=1G --readwrite=randrw --rwmixread=75

## Dedup

`duperemove` -- totally sucks.

`bedup` -- https://github.com/g2p/bedup
Install is easy:

    pip install cffi bedup

It doesn't work at all due to this, which is easy to patch by hand: https://github.com/g2p/bedup/issues/55

When doing dedup it works but the reclaimed space doesn't appear for a little while.  Offline dedup makes a HUGE amount of sense for this application -- very awesome.

## Quotas

## Snapshots



