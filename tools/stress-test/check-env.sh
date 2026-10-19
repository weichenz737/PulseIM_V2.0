#!/bin/bash
echo "--- env set ---"
env | grep -E '^(DB_|JWT_|TURN_|CORS_)' | sed 's/=.*/=<set>/'
echo "--- rc files ---"
grep -l "DB_PASSWORD" /root/.bashrc /root/.profile /etc/profile /etc/environment 2>/dev/null
echo "--- systemd ---"
grep -rls "DB_PASSWORD" /etc/systemd/system 2>/dev/null | head -5
echo "--- opt env files ---"
ls -la /opt/pulseim | grep -iE "env"
