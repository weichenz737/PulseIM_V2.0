#!/bin/bash
for C in pulse-im pulse-api; do
  H=$(docker inspect "$C" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^JWT_SECRET=' | cut -d= -f2- | md5sum | awk '{print $1}')
  echo "$C=$H"
done
