#!/bin/bash
docker logs pulse-nginx --since 15m 2>&1 | grep -oE '"(GET|POST) [^"]+"' | sort | uniq -c | sort -rn | head -15
