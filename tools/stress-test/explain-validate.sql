EXPLAIN (ANALYZE, BUFFERS)
SELECT c.type AS conv_type, c.mute_all AS mute_all,
       m.role AS member_role, m.speak_muted AS speak_muted, m.peer_user_id AS peer_user_id,
       f.id AS friend_id,
       (SELECT COUNT(*) FROM im_user_block b
         WHERE (b.user_id = 9000001 AND b.blocked_user_id = m.peer_user_id)
            OR (b.user_id = m.peer_user_id AND b.blocked_user_id = 9000001)) AS block_cnt
FROM im_conversation c
JOIN im_conversation_member m ON m.conversation_id = c.id AND m.user_id = 9000001
LEFT JOIN im_friend f ON f.user_id = 9000001 AND f.friend_id = m.peer_user_id
WHERE c.id = 9000001;

EXPLAIN (ANALYZE, BUFFERS)
SELECT user_id FROM im_conversation_member WHERE conversation_id = 9000001 AND user_id <> 9000001;
