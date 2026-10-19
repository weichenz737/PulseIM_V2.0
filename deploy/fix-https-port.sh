#!/bin/bash
set -e
cd /opt/pulseim
cp -f docker-compose.yml.bak docker-compose.yml 2>/dev/null || true

python3 <<'PY'
from pathlib import Path
p = Path("/opt/pulseim/docker-compose.yml")
text = p.read_text()
# restore from bak if broken
bak = Path("/opt/pulseim/docker-compose.yml.bak")
if bak.exists() and 'ports:' in bak.read_text():
    text = bak.read_text()

old = '''    ports:
      - "8080:80"
      - "443:443"
      - "8443:443"'''
new = '''    ports:
      - "8080:443"
      - "8081:80"
      - "443:443"
      - "8443:443"'''
old2 = '''    ports:
      - "8080:80"'''
if old in text:
    text = text.replace(old, new, 1)
elif '"8080:443"' in text and '"8081:80"' not in text:
    text = text.replace(
        '''    ports:
      - "8080:443"
      - "443:443"
      - "8443:443"''',
        new,
        1,
    )
elif old2 in text:
    text = text.replace(old2, new, 1)
else:
    # last resort: rewrite nginx ports block by line scan
    lines = text.splitlines(True)
    out = []
    i = 0
    while i < len(lines):
        out.append(lines[i])
        if lines[i].strip() == 'ports:' and i > 0 and 'nginx' in ''.join(out[-15:]):
            # skip existing port entries
            i += 1
            while i < len(lines) and lines[i].lstrip().startswith('- '):
                i += 1
            out.append('      - "8080:443"\n')
            out.append('      - "8081:80"\n')
            out.append('      - "443:443"\n')
            out.append('      - "8443:443"\n')
            continue
        i += 1
    text = ''.join(out)

p.write_text(text)
Path("/opt/pulseim/docker-compose.prod.yml").write_text(text)
print("compose ports updated")
# show nginx section
start = text.find('  nginx:')
print(text[start:start+550])
PY

docker-compose up -d --force-recreate nginx
sleep 3
docker ps | grep pulse-nginx
echo "=== HTTPS via :6080 ==="
curl -skI https://127.0.0.1:6080/ | head -8
echo "=== HTTP via :6081 ==="
curl -sI http://127.0.0.1:6081/ | head -5
