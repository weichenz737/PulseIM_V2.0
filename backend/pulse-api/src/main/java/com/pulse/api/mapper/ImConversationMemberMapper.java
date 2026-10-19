package com.pulse.api.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.pulse.api.entity.ImConversationMember;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface ImConversationMemberMapper extends BaseMapper<ImConversationMember> {

    /** 查找两人已有的单聊会话（防并发重复创建） */
    @Select("""
            SELECT m1.conversation_id
            FROM im_conversation_member m1
            JOIN im_conversation_member m2
              ON m2.conversation_id = m1.conversation_id
             AND m2.user_id = #{peerUserId}
            JOIN im_conversation c ON c.id = m1.conversation_id AND c.type = 1
            WHERE m1.user_id = #{userId}
            ORDER BY m1.conversation_id
            LIMIT 1
            """)
    Long findSharedPrivateConversationId(@Param("userId") Long userId, @Param("peerUserId") Long peerUserId);
}
