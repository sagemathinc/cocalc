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

## BUGS

Got a crash...

        [112175.804224] general protection fault: 0000 [#1] SMP
        [112175.805838] Modules linked in: ipt_REJECT xt_owner nf_conntrack_ipv4 nf_defrag_ipv4 xt_conntrack nf_conntrack xt_tcpudp ip6table_filter ip6_tables iptable_filter ip_tables x_tables dm_crypt binfmt_misc ppdev dm_multipath scsi_dh parport_pc parport serio_raw btrfs xor raid6_pq crct10dif_pclmul crc32_pclmul ghash_clmulni_intel aesni_intel aes_x86_64 lrw gf128mul glue_helper ablk_helper cryptd psmouse virtio_scsi
        [112175.808392] CPU: 3 PID: 29365 Comm: kworker/u8:3 Tainted: G        W     3.16.0-36-generic #48-Ubuntu
        [112175.808392] Hardware name: Google Google, BIOS Google 01/01/2011
        [112175.808392] Workqueue: btrfs-qgroup-rescan btrfs_qgroup_rescan_helper [btrfs]
        [112175.808392] task: ffff88017caa7010 ti: ffff88021d478000 task.ti: ffff88021d478000
        [112175.808392] RIP: 0010:[<ffffffffc01b395f>]  [<ffffffffc01b395f>] read_extent_buffer+0xdf/0x1a0 [btrfs]
        [112175.808392] RSP: 0018:ffff88021d47bc90  EFLAGS: 00010202
        [112175.808392] RAX: 0000000000000009 RBX: 0000000000000009 RCX: 0000000000000000
        [112175.808392] RDX: 0005080000000000 RSI: 0005080000000000 RDI: ffff88021d47bd60
        [112175.808392] RBP: ffff88021d47bcc0 R08: ffff880184e61cc8 R09: ffff880000000000
        [112175.808392] R10: 0000160000000000 R11: 0000000000001000 R12: ffff88021d47bd67
        [112175.808392] R13: 0000000000003ff8 R14: ffff880184e61c00 R15: 0000000000000003
        [112175.808392] FS:  0000000000000000(0000) GS:ffff8806bfd80000(0000) knlGS:0000000000000000
        [112175.808392] CS:  0010 DS: 0000 ES: 0000 CR0: 0000000080050033
        [112175.808392] CR2: 00007fb6300021c8 CR3: 0000000137d83000 CR4: 00000000001406e0
        [112175.808392] Stack:
        [112175.808392]  ffff880103b04060 000000000000028b 0000000000000000 ffff880184e61c00
        [112175.808392]  ffff88069883ad28 68000014e9530064 ffff88021d47bdb8 ffffffffc01f0b94
        [112175.808392]  ffff88021d47bd4c 00001fb800000001 ffff88017caa7078 00000120bfc93540
        [112175.808392] Call Trace:
        [112175.808392]  [<ffffffffc01f0b94>] btrfs_qgroup_rescan_worker+0x384/0x620 [btrfs]
        [112175.808392]  [<ffffffffc01c062f>] normal_work_helper+0x11f/0x2b0 [btrfs]
        [112175.808392]  [<ffffffffc01c09b2>] btrfs_qgroup_rescan_helper+0x12/0x20 [btrfs]
        [112175.808392]  [<ffffffff8108d142>] process_one_work+0x182/0x4e0
        [112175.808392]  [<ffffffff8108dedb>] worker_thread+0x6b/0x660
        [112175.808392]  [<ffffffff8108de70>] ? flush_delayed_work+0x50/0x50
        [112175.808392]  [<ffffffff81094d7b>] kthread+0xdb/0x100
        [112175.808392]  [<ffffffff81094ca0>] ? kthread_create_on_node+0x1c0/0x1c0
        [112175.808392]  [<ffffffff8178c8d8>] ret_from_fork+0x58/0x90
        [112175.808392]  [<ffffffff81094ca0>] ? kthread_create_on_node+0x1c0/0x1c0
        [112175.808392] Code: 48 29 c3 74 61 4c 89 d8 4c 89 d2 48 29 f0 48 39 d8 48 0f 47 c3 49 03 10 48 c1 fa 06 48 c1 e2 0c 4c 01 ca 48 01 d6 83 f8 08 72 b1 <48> 8b 16 49 8d 7c 24 08 49 83 c0 08 48 83 e7 f8 49 89 14 24 89
        [112175.808392] RIP  [<ffffffffc01b395f>] read_extent_buffer+0xdf/0x1a0 [btrfs]
        [112175.808392]  RSP <ffff88021d47bc90>
        [112175.900769] ---[ end trace d49d9015d8e719bf ]---
        Ma[1y12 175 .2 20:940:003777] BUG: unable to handle kernel paging request at ffffffffffffffd8
        [112175.904705] IP: [<ffffffff81095530>] kthread_data+0x10/0x20
        [112175.904705] PGD 1c15067 PUD 1c17067 PMD 0
        [9 112175c.om9pute014-7us0-5ce]n tOops: 0000 [#2] SMP ral1-c ker
        n
        el: [[112175.18104224] g2175.904705] Modules linked in: ipt_REJECTe xt_owner nf_conntrack_ipv4 nf_defrag_ipv4 xt_conntrack nf_conntrack xt_tcpudpneral protectio ip6table_filtern ip6_tables iptable_filter ip_tables x_tables dm_crypt binfmt_misc ppdev dm_multipath scsi_dh parport_pc fa pualrpt:o r0000 [#t serio_raw1] SMP
        May  2  btrfs xor20:40:09 compute raid6_pq crct10dif_pclmul c1-us-central1r-c c32_pclmul ghash_clmulni_intelkernel: [112175. aesni_intel aes_x86_6480 5l8r3w8] Modules linked in:  ipt_Rgf128mul glue_helperEJECT xt_ow naer nblk_helper cryptdf_conntra ckp_ipv4smouse virtio_scsi nf_defrag
        _ip
        v4 [112175.904705] CPU: 3 PID: 29365 Comm: kworker/u8:3 Tainted: G      D W     3.16.0-36-generic #48-Ubuntu
        xt_conntrack nf_[112175.904705] Hardware name: Google Google, BIOS Google 01/01/2011
        conntrack xt[_1t1cp2175.904705] task: ffff88017caa7010 ti: ffff88021d478000 task.ti: ffff88021d478000
        [112175.904705] RIP: 0010:[<ffffffff81095530>] udp  [ip<6tabflef_ffilfffff81095530>] kthread_data+0x10/0x20
        [112175.904705] RSP: 0018:ffff88021d47ba50  EFLAGS: 00010002
        ter ip6_table[s i112175.904705] RAX: 0000000000000000 RBX: 0000000000000003 RCX: 0000000000000006
        [112175.904705] RDX: 000000000000000f RSI: 0000000000000003 RDI: ffff88017caa7010
        ptable_fi[l11t21e7r5. 9i0p4705] RBP: ffff88021d47ba50 R08: 0000000000000000 R09: 0000000000000001
        [112175.904705] R10: ffff8806bfd97a20 R11: ffff8806977e4138 R12: ffff8806bfd934c0
        _tables[ x_table1s12175.904705] R13: ffff8806bfd934c0 R14: ffff88017caa7010 R15: 0000000000000000
        [112175.904705] FS:  0000000000000000(0000) GS:ffff8806bfd80000(0000) knlGS:0000000000000000
         d[m1_1cr2ypt binfmt175.904705] CS:  0010 DS: 0000 ES: 0000 CR0: 0000000080050033
        [112175.904705] CR2: 0000000000000028 CR3: 000000001fdb4000 CR4: 00000000001406e0
        _misc ppde[v1 1dm_m2175.904705] Stack:
        [112175.904705]  ffff88021d47ba68ultipath scsi_dh ffffffff8108e981 0000000000000003 parport_pc  pfarpfff88021d47bac8
        ort serio_raw bt[112175.904705]  ffffffff8178791d ffff88017caa7010r fs 0xor raid6_pq0000000000134c0 ffff88021d47bfd8 crct10dif_pclmu
        [112175.904705]  00000000000134c0l crc 32_pclmful gfff88017caa7010 ffff88017caa7768hash_clmulni_int ffff88017caa7000
        el aesni_intel a[112175.904705] Call Trace:
        [112175.904705]  [<ffffffff8108e981>] wq_worker_sleeping+0x11/0x90
        es_x86_64 lrw [gf112175.904705]  [<ffffffff8178791d>] __schedule+0x6ed/0x890
        [112175.904705]  [<ffffffff81787ae9>] schedule+0x29/0x70
        128mul glue_help[112175.904705]  [<ffffffff81072c30>] do_exit+0x840/0xab0
        [112175.904705]  [<ffffffff81016d5d>] oops_end+0xad/0x150
        er ablk_helper c[112175.904705]  [<ffffffff8101713b>] die+0x4b/0x70
        [112175.904705]  [<ffffffff81013966>] do_general_protection+0x126/0x1b0
        ryptd ps[m1ou1se vi2175.904705]  [<ffffffff8178e948>] general_protection+0x28/0x30
        rtio_s[c1si
        M1ay  2175.904705]  [<ffffffffc01b395f>] ? read_extent_buffer+0xdf/0x1a0 [btrfs]
        2 20:4[110:09 2compu175.904705]  [<ffffffffc01f0b94>] btrfs_qgroup_rescan_worker+0x384/0x620 [btrfs]
        te1-us-central1-[112175.904705]  [<ffffffffc01c062f>] normal_work_helper+0x11f/0x2b0 [btrfs]
        c k[e1rnel1:21 7[5.11920174705]  [<ffffffffc01c09b2>] btrfs_qgroup_rescan_helper+0x12/0x20 [btrfs]
        [112175.904705]  [<ffffffff8108d142>] process_one_work+0x182/0x4e0
        5.808392] CPU: 3[112175.904705]  [<ffffffff8108dedb>] worker_thread+0x6b/0x660
        [112175.904705]  [<ffffffff8108de70>] ? flush_delayed_work+0x50/0x50
         PI[D1:1 29365 Comm2175.904705]  [<ffffffff81094d7b>] kthread+0xdb/0x100
        [112175.904705]  [<ffffffff81094ca0>] ? kthread_create_on_node+0x1c0/0x1c0
        : kworker/u8:3 [T112175.904705]  [<ffffffff8178c8d8>] ret_from_fork+0x58/0x90
        [112175.904705]  [<ffffffff81094ca0>] ? kthread_create_on_node+0x1c0/0x1c0
        aint[11ed: G       2175.904705] Code: 00  W     34.16.0-368 89 -generic #48-Ubue5 5d ntu
        May  428  20:84b 40 0:09 compute1-usc8 48 -centcr1a l1-ec kern8 02 el: [112175.808833 e0 92] Hardware nam01 c3 e: Google Googl6e6 2e , 0BfI OS 1Gofogle 01 84 /01/2011
        May  200 00  200:400:09 comput 00 e100-us-centr 0al1-cf 1f  k4e4rn el: [11217500 .808392] W0o0r kqu4e8 8b ue:8 7btrfs -qgroupc8 -rescan btrfs0_qg4 00 roup_rescan_help00 55 er [btrfs]
        May 48 89  2 20:40:09 compe5 <48> ute81b- us-cent4ral10 d8 5-c kerdnel: [1121 c3 66 2e 0f 1f 75.884 08300 92] task:0 ffff88017ca0a7 01000 ti: ffff88021 d00 4780000 ta0s k.t0if:  1f ffff88021d47800044 00
        May  2 20:40:000
        9[ 1com1pute1-us-ce2175.904705] RIP  [<ffffffff81095530>] kthread_data+0x10/0x20
        [112175.904705]  RSP <ffff88021d47ba50>
        ntral1-[c1 k1ernel:2175.904705] CR2: ffffffffffffffd8
        [112175.904705] ---[ end trace d49d9015d8e719c0 ]---
         [112175.808392][112175.904705] Fixing recursive fault but reboot is needed!
         RIP: 0010:[<ffffffffc01b395f>]  [<ffffffffc01b395f>] read_extent_buffer+0xdf/0x1a0 [btrfs]
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392] RSP: 0018:ffff88021d47bc90  EFLAGS: 00010202
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392] RAX: 0000000000000009 RBX: 0000000000000009 RCX: 0000000000000000
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392] RDX: 0005080000000000 RSI: 0005080000000000 RDI: ffff88021d47bd60
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392] RBP: ffff88021d47bcc0 R08: ffff880184e61cc8 R09: ffff880000000000
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392] R10: 0000160000000000 R11: 0000000000001000 R12: ffff88021d47bd67
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392] R13: 0000000000003ff8 R14: ffff880184e61c00 R15: 0000000000000003
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392] FS:  0000000000000000(0000) GS:ffff8806bfd80000(0000) knlGS:0000000000000000
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392] CS:  0010 DS: 0000 ES: 0000 CR0: 0000000080050033
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392] CR2: 00007fb6300021c8 CR3: 0000000137d83000 CR4: 00000000001406e0
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392] Stack:
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392]  ffff880103b04060 000000000000028b 0000000000000000 ffff880184e61c00
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392]  ffff88069883ad28 68000014e9530064 ffff88021d47bdb8 ffffffffc01f0b94
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392]  ffff88021d47bd4c 00001fb800000001 ffff88017caa7078 00000120bfc93540
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392] Call Trace:
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392]  [<ffffffffc01f0b94>] btrfs_qgroup_rescan_worker+0x384/0x620 [btrfs]
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392]  [<ffffffffc01c062f>] normal_work_helper+0x11f/0x2b0 [btrfs]
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392]  [<ffffffffc01c09b2>] btrfs_qgroup_rescan_helper+0x12/0x20 [btrfs]
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392]  [<ffffffff8108d142>] process_one_work+0x182/0x4e0
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392]  [<ffffffff8108dedb>] worker_thread+0x6b/0x660
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392]  [<ffffffff8108de70>] ? flush_delayed_work+0x50/0x50
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392]  [<ffffffff81094d7b>] kthread+0xdb/0x100
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392]  [<ffffffff81094ca0>] ? kthread_create_on_node+0x1c0/0x1c0
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392]  [<ffffffff8178c8d8>] ret_from_fork+0x58/0x90
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392]  [<ffffffff81094ca0>] ? kthread_create_on_node+0x1c0/0x1c0
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392] Code: 48 29 c3 74 61 4c 89 d8 4c 89 d2 48 29 f0 48 39 d8 48 0f 47 c3 49 03 10 48 c1 fa 06 48 c1 e2 0c 4c 01 ca 48 01 d6 83 f8 08 72 b1 <48> 8b 16 49 8d 7c 24 08 49 83 c0 08 48 83 e7 f8 49 89 14 24 89
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392] RIP  [<ffffffffc01b395f>] read_extent_buffer+0xdf/0x1a0 [btrfs]
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.808392]  RSP <ffff88021d47bc90>
        May  2 20:40:09 compute1-us-central1-c kernel: [112175.900769] ---[ end trace d49d9015d8e719bf ]---




