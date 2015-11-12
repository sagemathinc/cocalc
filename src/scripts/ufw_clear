#! /usr/bin/env bash
set -e
set -o pipefail

iptables --flush
rules=($(iptables --list | grep Chain | grep -Eo "ufw-[a-z-]+" | xargs echo))
for i in "${rules[@]}"
do
  iptables --delete-chain $i
done

ip6tables --flush
rules6=($(ip6tables --list | grep Chain | grep -Eo "ufw6-[a-z-]+" | xargs echo))
for i in "${rules6[@]}"
do
  ip6tables --delete-chain $i
done
