#!/bin/bash
NAME=$1
DUR=$2
for i in $(seq 1 $((DUR / 5))); do
  docker exec pulse-postgres psql -U pulse -d pulseim -tAc \
    "SELECT round(extract(epoch from (now()-query_start))::numeric,1) AS sec, pid, state, left(query,70)
     FROM pg_stat_activity
     WHERE state <> 'idle' AND query NOT ILIKE '%pg_stat_activity%'
     ORDER BY sec DESC LIMIT 10;" >> /tmp/pg-act-$NAME.txt
  echo "=====" >> /tmp/pg-act-$NAME.txt
  sleep 5
done
