#!/usr/bin/env python3
"""Generate a fresh stack's credentials on its server; never replace an .env."""
import json
import os
from pathlib import Path
import secrets
import sys

public_ip, deploy_directory = sys.argv[1:3]
destination = Path(deploy_directory).resolve()
env_file = destination / '.env'
destination.mkdir(parents=True, exist_ok=True)
values = {
    'PUBLIC_IP': public_ip,
    'DB_PASSWORD': secrets.token_urlsafe(36),
    'JWT_SECRET': secrets.token_urlsafe(48),
    'TURN_CREDENTIAL': secrets.token_urlsafe(36),
    'MINIO_ACCESS_KEY': 'pulse' + secrets.token_hex(8),
    'MINIO_SECRET_KEY': secrets.token_urlsafe(36),
    'MINIO_PUBLIC_URL': f'https://{public_ip}/pulseim/storage/pulse-avatar',
    'TURN_URLS': f'stun:{public_ip}:3478,turn:{public_ip}:3478?transport=udp,turn:{public_ip}:3478?transport=tcp',
    'CORS_ALLOWED_ORIGINS': f'https://{public_ip},http://{public_ip},https://localhost,http://localhost,capacitor://localhost',
    'SMS_DEV_FIXED_CODE': '',
    'ALLOW_FIXED_SMS_CODE': 'false',
    'PULSE_DOCUMENT_PREVIEW_ENABLED': 'true',
    'ADMIN_USERNAME': 'admin',
    'ADMIN_PASSWORD': secrets.token_urlsafe(20),
}
# A single exclusive write prevents accidental rotation of a running database.
descriptor = os.open(env_file, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
with os.fdopen(descriptor, 'w') as stream:
    stream.write(''.join(f'{key}={value}\n' for key, value in values.items()))
print('Created private environment file; credentials are not printed.')
