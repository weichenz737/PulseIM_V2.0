-- Cleanup of PulseIM stress-test data (conversation ids 9000001-9001000 only).
BEGIN;
DELETE FROM im_message WHERE conversation_id BETWEEN 9000001 AND 9001000;
UPDATE im_conversation SET last_msg_preview = NULL, last_msg_time = NULL, updated_at = NOW()
WHERE id BETWEEN 9000001 AND 9001000;
UPDATE im_conversation_member SET unread_count = 0
WHERE conversation_id BETWEEN 9000001 AND 9001000;
COMMIT;
