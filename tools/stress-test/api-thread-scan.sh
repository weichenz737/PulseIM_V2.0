#!/bin/bash
docker logs pulse-api --since 2m 2>&1 | grep -B2 'FROM sys_user' | grep -oE '\[[a-zA-Z0-9-]+ ?[0-9]*\]' | sort | uniq -c | sort -rn | head -8
