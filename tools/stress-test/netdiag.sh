#!/bin/bash
echo "--- host ESTABLISHED (all) ---"
ss -tan state established | head -30
echo "--- host ESTABLISHED count ---"
ss -tan state established | wc -l
echo "--- nginx container netstat ---"
docker exec pulse-nginx sh -c 'netstat -an 2>/dev/null | grep -E ":80|:443" | head -20'
echo "--- iptables nat ---"
iptables -t nat -L -n 2>/dev/null | head -25
echo "--- nginx processes ---"
docker exec pulse-nginx sh -c 'ps aux 2>/dev/null | grep -c nginx'
