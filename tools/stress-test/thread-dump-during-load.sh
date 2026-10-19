#!/bin/bash
# Usage: bash thread-dump-during-load.sh <wait_seconds_before_dump>
WAIT=$1
PID=$(docker top pulse-im | awk 'NR==2 {print $2}')
echo "IM_PID=$PID"
sleep "$WAIT"
kill -3 "$PID"
echo "SIGQUIT sent at $(date +%H:%M:%S)"
