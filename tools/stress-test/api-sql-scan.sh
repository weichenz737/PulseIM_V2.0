#!/bin/bash
docker logs pulse-api --since 3m 2>&1 \
  | grep -oE 'Preparing: SELECT [a-z_, ]+ FROM [a-z_]+' \
  | sed 's/Preparing: //' \
  | sort | uniq -c | sort -rn | head -12
