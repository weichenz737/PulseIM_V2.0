#!/bin/bash
# Collects host + container metrics during a stress run.
# Usage: bash pulse-stress-monitor.sh <name> <duration_seconds>
NAME=$1
DURATION=${2:-120}
OUT=/tmp/pulse-stress-${NAME}.csv
rm -f "$OUT"
START=$(date +%s)
END=$((START + DURATION))
while [ "$(date +%s)" -lt "$END" ]; do
  TS=$(date +%s)
  LOAD=$(awk '{print $1","$2","$3}' /proc/loadavg)
  STATS=$(docker stats --no-stream --format '{{.Name}},{{.CPUPerc}},{{.MemUsage}}' \
    pulse-im pulse-api pulse-postgres pulse-nginx pulse-redis pulse-stress-gen 2>/dev/null | tr '\n' ';')
  C443=$(ss -tn state established '( sport = :443 )' 2>/dev/null | wc -l)
  C8080=$(ss -tn state established '( sport = :8080 )' 2>/dev/null | wc -l)
  C8081=$(ss -tn state established '( sport = :6081 )' 2>/dev/null | wc -l)
  PG_ACT=$(docker exec pulse-postgres psql -U pulse -d pulseim -tAc 'select count(*) from pg_stat_activity' 2>/dev/null)
  echo "$TS,$LOAD,$C443,$C8080,$C8081,$PG_ACT,$STATS" >> "$OUT"
  sleep 2
done
