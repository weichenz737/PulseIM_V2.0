package com.pulse.api.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.pulse.api.entity.ImMessageHide;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ImMessageHideMapper extends BaseMapper<ImMessageHide> {

    /** 对本端单向隐藏会话内全部历史消息 */
    @Insert("""
            INSERT INTO im_message_hide (user_id, conversation_id, msg_id, created_at)
            SELECT #{userId}, m.conversation_id, m.msg_id, NOW()
            FROM im_message m
            WHERE m.conversation_id = #{conversationId}
              AND NOT EXISTS (
                SELECT 1 FROM im_message_hide h
                WHERE h.user_id = #{userId} AND h.msg_id = m.msg_id
              )
            """)
    int hideAllInConversation(@Param("userId") Long userId, @Param("conversationId") Long conversationId);
}
