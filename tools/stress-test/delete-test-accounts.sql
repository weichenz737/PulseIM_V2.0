-- Optional: remove all PulseIM stress-test accounts/conversations/friends.
-- Run inside pulse-postgres (psql -U pulse -d pulseim) when the user confirms.
BEGIN;
DELETE FROM im_friend
WHERE user_id BETWEEN 9000001 AND 9002000
   OR friend_id BETWEEN 9000001 AND 9002000;
DELETE FROM im_conversation_member
WHERE conversation_id BETWEEN 9000001 AND 9001000
   OR user_id BETWEEN 9000001 AND 9002000;
DELETE FROM im_conversation WHERE id BETWEEN 9000001 AND 9001000;
DELETE FROM sys_user WHERE id BETWEEN 9000001 AND 9002000;
COMMIT;
