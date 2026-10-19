#!/bin/bash
docker logs pulse-im --since 5m 2>&1 | sed -n '/Full thread dump/,$p' > /tmp/im-dump.txt
grep -c '^\s*at ' /tmp/im-dump.txt
grep -E '^"' /tmp/im-dump.txt
