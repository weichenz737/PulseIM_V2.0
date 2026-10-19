#!/bin/bash
docker exec pulse-postgres psql -U pulse -d pulseim -v ON_ERROR_STOP=1 -c \
  'CREATE INDEX IF NOT EXISTS idx_im_msg_client_dedup ON im_message(client_msg_id, from_user_id, conversation_id);'
docker exec pulse-postgres psql -U pulse -d pulseim -tAc \
  "SELECT indexname FROM pg_indexes WHERE tablename='im_message' ORDER BY indexname;"
