# Notes on ZFS setup

Always do the following when setting up a new pool

    zfs set compression=lz4 pool         # excellent speed/size tradeoff
    zfs set dedup=on pool                # seems to work very well for me, given relatively small data size and large memory
    zfs set sync=disabled pool           # without this