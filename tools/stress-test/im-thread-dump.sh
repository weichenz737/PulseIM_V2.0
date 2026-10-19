#!/bin/bash
docker stats --no-stream --format '{{.Name}} {{.CPUPerc}}' pulse-im pulse-postgres pulse-redis
echo "--- thread states ---"
docker exec pulse-im sh -c 'jstack 1 2>/dev/null' \
  | grep -E '^\"|java.lang.Thread.State|at com.pulse|at org.springframework.jdbc|at org.springframework.data.redis|at io.netty' \
  | grep -A1 'java.lang.Thread.State' | grep -B1 'RUNNABLE\|WAITING\|TIMED_WAITING' | head -80
