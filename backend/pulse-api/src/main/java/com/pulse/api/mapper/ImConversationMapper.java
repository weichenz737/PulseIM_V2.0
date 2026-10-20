package com.pulse.api.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.pulse.api.entity.ImConversation;
import com.pulse.api.vo.ConversationVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface ImConversationMapper extends BaseMapper<ImConversation> {

    @Select("""
            SELECT c.id,
                   c.type,
                   CASE
                     WHEN c.type = 1 THEN COALESCE(NULLIF(TRIM(fr.remark), ''), peer.nickname, c.title)
                     ELSE COALESCE(NULLIF(TRIM(m.group_remark), ''), c.title)
                   END AS title,
                   CASE WHEN c.type = 1 THEN peer.avatar_url ELSE c.avatar_url END AS avatar_url,
                   CASE
                     WHEN c.type = 2 AND m.joined_at IS NOT NULL
                          AND (lm.send_time IS NULL OR lm.send_time < m.joined_at)
                       THEN NULL
                     WHEN lm.msg_id IS NULL THEN NULL
                     WHEN lm.burn_after_read = TRUE THEN
                       CASE WHEN lm.hidden_for_viewer = TRUE
                                  OR (lm.burn_expires_at IS NOT NULL AND lm.burn_expires_at <= NOW())
                                  OR (lm.auto_delete_expires_at IS NOT NULL AND lm.auto_delete_expires_at <= NOW())
                         THEN '[阅后即焚消息已销毁]' ELSE '[阅后即焚消息]' END
                      WHEN lm.msg_type = 7
                        THEN (CASE
                               WHEN c.type = 2 AND lm.from_user_id <> m.user_id
                                 THEN COALESCE(NULLIF(TRIM(last_sender.nickname), ''), '成员') || ': '
                               WHEN lm.from_user_id = m.user_id THEN '我: '
                               ELSE ''
                             END) || '[红包]'
                      WHEN lm.msg_type = 8
                        THEN (CASE
                               WHEN c.type = 2 AND lm.from_user_id <> m.user_id
                                 THEN COALESCE(NULLIF(TRIM(last_sender.nickname), ''), '成员') || ': '
                               WHEN lm.from_user_id = m.user_id THEN '我: '
                               ELSE ''
                             END) || '[转账]'
                      WHEN lm.msg_type = 9 AND lm.content LIKE '%"kind":"red_packet_received"%'
                        THEN (CASE
                               WHEN c.type = 2 AND lm.from_user_id <> m.user_id
                                 THEN COALESCE(NULLIF(TRIM(last_sender.nickname), ''), '成员') || ': '
                               WHEN lm.from_user_id = m.user_id THEN '我: '
                               ELSE ''
                             END) || '[红包领取消息]'
                      WHEN lm.msg_type = 9 AND lm.content LIKE '%"kind":"transfer_received"%'
                        THEN (CASE
                               WHEN c.type = 2 AND lm.from_user_id <> m.user_id
                                 THEN COALESCE(NULLIF(TRIM(last_sender.nickname), ''), '成员') || ': '
                               WHEN lm.from_user_id = m.user_id THEN '我: '
                               ELSE ''
                             END) || '[转账收款消息]'
                      WHEN lm.msg_type = 9
                        THEN (CASE
                               WHEN c.type = 2 AND lm.from_user_id <> m.user_id
                                 THEN COALESCE(NULLIF(TRIM(last_sender.nickname), ''), '成员') || ': '
                               WHEN lm.from_user_id = m.user_id THEN '我: '
                               ELSE ''
                             END) || COALESCE(NULLIF(TRIM(lm.content), ''), '[群提示]')
                      WHEN lm.msg_type = 0
                        THEN (CASE
                               WHEN c.type = 2 AND lm.from_user_id <> m.user_id
                                 THEN COALESCE(NULLIF(TRIM(last_sender.nickname), ''), '成员') || ': '
                               WHEN lm.from_user_id = m.user_id THEN '我: '
                               ELSE ''
                             END)
                             || COALESCE(lm.content, '')
                      WHEN lm.msg_type = 1
                        THEN (CASE
                               WHEN c.type = 2 AND lm.from_user_id <> m.user_id
                                 THEN COALESCE(NULLIF(TRIM(last_sender.nickname), ''), '成员') || ': '
                               WHEN lm.from_user_id = m.user_id THEN '我: '
                               ELSE ''
                             END) || '[图片]'
                      WHEN lm.msg_type = 2
                        THEN (CASE
                               WHEN c.type = 2 AND lm.from_user_id <> m.user_id
                                 THEN COALESCE(NULLIF(TRIM(last_sender.nickname), ''), '成员') || ': '
                               WHEN lm.from_user_id = m.user_id THEN '我: '
                               ELSE ''
                             END)
                             || CASE
                                  WHEN LOWER(COALESCE(latest_file.content_type, '')) LIKE 'video/%'
                                    OR LOWER(COALESCE(latest_file.original_name, '')) ~* '\\.(mp4|webm|mov|m4v|3gp|3gpp)$'
                                    OR lm.content ~* '"contentType"\\s*:\\s*"video/'
                                    OR lm.content ~* '\\.(mp4|webm|mov|m4v|3gp|3gpp)'
                                 THEN '[视频]'
                                 ELSE '[文件]'
                               END
                      WHEN lm.msg_type = 3
                        THEN (CASE
                               WHEN c.type = 2 AND lm.from_user_id <> m.user_id
                                 THEN COALESCE(NULLIF(TRIM(last_sender.nickname), ''), '成员') || ': '
                               WHEN lm.from_user_id = m.user_id THEN '我: '
                               ELSE ''
                             END) || '[语音]'
                      WHEN lm.msg_type = 4
                        THEN (CASE
                               WHEN c.type = 2 AND lm.from_user_id <> m.user_id
                                 THEN COALESCE(NULLIF(TRIM(last_sender.nickname), ''), '成员') || ': '
                               WHEN lm.from_user_id = m.user_id THEN '我: '
                               ELSE ''
                             END) || '[聊天记录]'
                      WHEN lm.msg_type = 5
                        THEN (CASE
                               WHEN c.type = 2 AND lm.from_user_id <> m.user_id
                                 THEN COALESCE(NULLIF(TRIM(last_sender.nickname), ''), '成员') || ': '
                               WHEN lm.from_user_id = m.user_id THEN '我: '
                               ELSE ''
                             END) || '[名片]'
                      WHEN lm.msg_type = 6
                        THEN (CASE
                               WHEN c.type = 2 AND lm.from_user_id <> m.user_id
                                 THEN COALESCE(NULLIF(TRIM(last_sender.nickname), ''), '成员') || ': '
                               WHEN lm.from_user_id = m.user_id THEN '我: '
                               ELSE ''
                             END) || '[位置]'
                      ELSE (CASE
                              WHEN c.type = 2 AND lm.from_user_id <> m.user_id
                                THEN COALESCE(NULLIF(TRIM(last_sender.nickname), ''), '成员') || ': '
                              WHEN lm.from_user_id = m.user_id THEN '我: '
                              ELSE ''
                            END)
                           || COALESCE(lm.content, '')
                   END AS last_msg_preview,
                   CASE
                     WHEN c.type = 2 AND m.joined_at IS NOT NULL
                          AND (lm.send_time IS NULL OR lm.send_time < m.joined_at)
                       THEN NULL
                     ELSE lm.send_time
                   END AS last_msg_time,
                   m.unread_count AS unread_count,
                   resolved_peer.peer_id AS peer_user_id,
                   COALESCE(m.archived, FALSE) AS archived,
                   COALESCE(m.pinned, FALSE) AS pinned,
                   COALESCE(m.mute, FALSE) AS mute,
                   COALESCE(m.hidden, FALSE) AS hidden,
                   COALESCE(m.mention_unread, FALSE) AS mention_unread,
                   CASE WHEN c.type = 1 THEN NULLIF(TRIM(fr.tag), '') ELSE NULL END AS tag
            FROM im_conversation_member m
            JOIN im_conversation c ON c.id = m.conversation_id
            LEFT JOIN LATERAL (
                SELECT COALESCE(
                    NULLIF(m.peer_user_id, m.user_id),
                    (SELECT other.user_id
                     FROM im_conversation_member other
                     WHERE other.conversation_id = m.conversation_id
                       AND other.user_id <> m.user_id
                     ORDER BY other.id
                     LIMIT 1)
                ) AS peer_id
            ) resolved_peer ON c.type = 1
            LEFT JOIN sys_user peer ON peer.id = resolved_peer.peer_id
            LEFT JOIN im_friend fr ON fr.user_id = m.user_id AND fr.friend_id = resolved_peer.peer_id
            LEFT JOIN LATERAL (
                SELECT msg_id, from_user_id, msg_type, content, file_id, send_time,
                       burn_after_read, burn_expires_at, auto_delete_expires_at,
                       EXISTS (
                         SELECT 1 FROM im_message_hide hh
                         WHERE hh.user_id = #{userId} AND hh.msg_id = im_message.msg_id
                       ) AS hidden_for_viewer
                FROM im_message
                WHERE conversation_id = c.id
                  AND (c.type <> 2 OR m.joined_at IS NULL OR send_time >= m.joined_at)
                  AND COALESCE(recalled, FALSE) = FALSE
                  AND (auto_delete_expires_at IS NULL OR auto_delete_expires_at > NOW()
                       OR burn_after_read = TRUE)
                  AND (burn_after_read = TRUE OR NOT EXISTS (
                      SELECT 1 FROM im_message_hide hh
                      WHERE hh.user_id = #{userId} AND hh.msg_id = im_message.msg_id
                  ))
                ORDER BY send_time DESC NULLS LAST, id DESC
                LIMIT 1
             ) lm ON TRUE
             LEFT JOIN im_file latest_file ON latest_file.file_id = lm.file_id
             LEFT JOIN sys_user last_sender ON last_sender.id = lm.from_user_id
             WHERE m.user_id = #{userId}
              AND (COALESCE(m.hidden, FALSE) = FALSE OR c.type = 2)
              AND (c.type <> 1 OR resolved_peer.peer_id IS NOT NULL)
            ORDER BY COALESCE(m.pinned, FALSE) DESC,
                     lm.send_time DESC NULLS LAST,
                     c.last_msg_time DESC NULLS LAST
            """)
    List<ConversationVO> listByUserId(@Param("userId") Long userId);
}
