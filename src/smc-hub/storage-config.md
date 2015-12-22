
## This must be in root crontab:

```
@reboot      USER=root /home/salvus/smc/src/smc-hub/scripts/storage start

```

## Make sure this in /etc/ssh/sshd_config:

```
# Mount snapshots remotely via sshfs using 'sshfs -o ro,allow_other,default_permissions projects: /mnt/x'
Match User root
     ChrootDirectory /projects/.zfs/snapshot
     ForceCommand internal-sftp
```
