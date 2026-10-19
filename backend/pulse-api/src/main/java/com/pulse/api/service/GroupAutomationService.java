package com.pulse.api.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.pulse.api.entity.ImConversation;
import com.pulse.api.entity.ImConversationMember;
import com.pulse.api.entity.ImGroupScheduledMessage;
import com.pulse.api.entity.SysUser;
import com.pulse.api.event.GroupMemberJoinedEvent;
import com.pulse.api.mapper.ImConversationMapper;
import com.pulse.api.mapper.ImConversationMemberMapper;
import com.pulse.api.mapper.ImGroupScheduledMessageMapper;
import com.pulse.api.mapper.SysUserMapper;
import com.pulse.api.vo.GroupScheduledMessageVO;
import com.pulse.api.vo.GroupWelcomeVO;
import com.pulse.api.vo.MessageVO;
import com.pulse.common.exception.BizException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** 群欢迎语和一次性定时消息。 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GroupAutomationService {
    /** 一条定时任务内包含多个实际消息时使用的消息类型。 */
    private static final int MIXED_MESSAGE_TYPE = 4;

    private final ImConversationMapper conversationMapper;
    private final ImConversationMemberMapper memberMapper;
    private final ImGroupScheduledMessageMapper scheduledMapper;
    private final SysUserMapper userMapper;
    private final JdbcTemplate jdbcTemplate;
    private final ConversationService conversationService;
    private final SocialService socialService;
    private final ObjectMapper objectMapper;

    @EventListener
    public void onMemberJoined(GroupMemberJoinedEvent event) {
        if (event == null || event.conversationId() == null || event.userId() == null) return;
        try {
            ImConversation group = conversationMapper.selectById(event.conversationId());
            if (group == null || group.getType() == null || group.getType() != 2
                    || !StringUtils.hasText(group.getGroupWelcomeMessage())) return;
            Long setterId = group.getGroupWelcomeSetterId();
            if (setterId == null) setterId = group.getOwnerId();
            if (setterId == null || !isMember(group.getId(), setterId)) {
                log.warn("skip group welcome because setter is no longer a member, conversationId={}, setterId={}",
                        group.getId(), setterId);
                return;
            }
            String clientMsgId = "group_welcome_" + group.getId() + "_" + event.userId();
            socialService.sendMessage(
                    setterId,
                    group.getId(),
                    null,
                    group.getGroupWelcomeMessage().trim(),
                    clientMsgId,
                    null,
                    0
            );
        } catch (Exception e) {
            // 入群本身不能因为欢迎语配置异常失败。
            log.warn("send group welcome failed, conversationId={}, userId={}, error={}",
                    event.conversationId(), event.userId(), e.getMessage());
        }
    }

    public GroupWelcomeVO getWelcome(Long userId, Long conversationId) {
        ImConversation group = requireMemberGroup(userId, conversationId);
        return toWelcomeVO(group);
    }

    public void saveWelcome(Long userId, Long conversationId, String message) {
        ImConversation group = conversationService.requireGroupManager(userId, conversationId);
        String next = message == null ? "" : message.trim();
        if (next.length() > 2000) throw new BizException("欢迎语不能超过2000字");
        boolean hadMessage = StringUtils.hasText(group.getGroupWelcomeMessage());
        group.setGroupWelcomeMessage(next);
        group.setGroupWelcomeSetterId(StringUtils.hasText(next) ? userId : null);
        group.setUpdatedAt(OffsetDateTime.now());
        conversationMapper.updateById(group);
        if (!StringUtils.hasText(next)) {
            conversationService.postGroupSystemTip(userId, conversationId, "已清空群聊欢迎语");
        } else {
            conversationService.postGroupSystemTip(userId, conversationId,
                    hadMessage ? "已修改群聊欢迎语" : "已设置群聊欢迎语");
        }
    }

    public List<GroupScheduledMessageVO> listScheduledMessages(Long userId, Long conversationId) {
        conversationService.requireGroupManager(userId, conversationId);
        return scheduledMapper.selectList(new LambdaQueryWrapper<ImGroupScheduledMessage>()
                        .eq(ImGroupScheduledMessage::getConversationId, conversationId)
                        .ne(ImGroupScheduledMessage::getStatus, "CANCELLED")
                        .orderByAsc(ImGroupScheduledMessage::getSendAt)
                        .orderByAsc(ImGroupScheduledMessage::getId))
                .stream().map(this::toScheduledVO).toList();
    }

    public GroupScheduledMessageVO createScheduledMessage(
            Long userId, Long conversationId, Integer msgType, String content, OffsetDateTime sendAt) {
        conversationService.requireGroupManager(userId, conversationId);
        validateScheduled(msgType, content, sendAt);
        ImGroupScheduledMessage row = new ImGroupScheduledMessage();
        row.setConversationId(conversationId);
        row.setSetterId(userId);
        row.setMsgType(msgType);
        row.setContent(content.trim());
        row.setSendAt(sendAt);
        row.setStatus("PENDING");
        row.setCreatedAt(OffsetDateTime.now());
        row.setUpdatedAt(OffsetDateTime.now());
        scheduledMapper.insert(row);
        return toScheduledVO(row);
    }

    public GroupScheduledMessageVO updateScheduledMessage(
            Long userId, Long conversationId, Long scheduleId, Integer msgType, String content, OffsetDateTime sendAt) {
        conversationService.requireGroupManager(userId, conversationId);
        ImGroupScheduledMessage row = requireScheduled(conversationId, scheduleId);
        if (!"PENDING".equals(row.getStatus()) && !"FAILED".equals(row.getStatus())) {
            throw new BizException("该定时消息已发送，不能修改");
        }
        validateScheduled(msgType, content, sendAt);
        row.setSetterId(userId);
        row.setMsgType(msgType);
        row.setContent(content.trim());
        row.setSendAt(sendAt);
        row.setStatus("PENDING");
        row.setLastError(null);
        row.setUpdatedAt(OffsetDateTime.now());
        scheduledMapper.updateById(row);
        return toScheduledVO(row);
    }

    public void cancelScheduledMessage(Long userId, Long conversationId, Long scheduleId) {
        conversationService.requireGroupManager(userId, conversationId);
        ImGroupScheduledMessage row = requireScheduled(conversationId, scheduleId);
        if ("SENT".equals(row.getStatus())) throw new BizException("该定时消息已发送");
        row.setStatus("CANCELLED");
        row.setUpdatedAt(OffsetDateTime.now());
        scheduledMapper.updateById(row);
    }

    /** 每秒抢占到期任务；消息发送沿用普通消息服务，保证头像、未读和推送一致。 */
    @Scheduled(fixedDelay = 1000L, initialDelay = 3000L)
    public void dispatchDueMessages() {
        List<ImGroupScheduledMessage> due = scheduledMapper.selectList(new LambdaQueryWrapper<ImGroupScheduledMessage>()
                .eq(ImGroupScheduledMessage::getStatus, "PENDING")
                .le(ImGroupScheduledMessage::getSendAt, OffsetDateTime.now())
                .orderByAsc(ImGroupScheduledMessage::getSendAt)
                .orderByAsc(ImGroupScheduledMessage::getId)
                .last("LIMIT 20"));
        for (ImGroupScheduledMessage row : due) {
            int claimed = jdbcTemplate.update(
                    "UPDATE im_group_scheduled_message SET status='SENDING', updated_at=NOW() WHERE id=? AND status='PENDING'",
                    row.getId());
            if (claimed != 1) continue;
            try {
                ImConversation group = conversationMapper.selectById(row.getConversationId());
                if (group == null || !isMember(row.getConversationId(), row.getSetterId())) {
                    throw new BizException("设置人已不在群内，无法发送");
                }
                String sentMsgId = null;
                if (row.getMsgType() != null && row.getMsgType() == MIXED_MESSAGE_TYPE) {
                    List<ScheduledPart> parts = parseMixedContent(row.getContent());
                    for (int index = 0; index < parts.size(); index++) {
                        ScheduledPart part = parts.get(index);
                        MessageVO sent = socialService.sendMessage(
                                row.getSetterId(), row.getConversationId(), null, part.content(),
                                "group_scheduled_" + row.getId() + "_" + index, null, part.msgType(),
                                null, false, scheduledFileId(part.msgType(), part.content()));
                        if (sent != null && StringUtils.hasText(sent.getId())) {
                            sentMsgId = sent.getId();
                            jdbcTemplate.update("UPDATE im_message SET scheduled_message=TRUE WHERE msg_id=?", sent.getId());
                        }
                    }
                } else {
                    MessageVO sent = socialService.sendMessage(
                            row.getSetterId(), row.getConversationId(), null, row.getContent(),
                            "group_scheduled_" + row.getId(), null, row.getMsgType(),
                            null, false, scheduledFileId(row.getMsgType(), row.getContent()));
                    if (sent != null && StringUtils.hasText(sent.getId())) {
                        sentMsgId = sent.getId();
                        jdbcTemplate.update("UPDATE im_message SET scheduled_message=TRUE WHERE msg_id=?", sent.getId());
                    }
                }
                row.setStatus("SENT");
                row.setSentMsgId(sentMsgId);
                row.setLastError(null);
                row.setUpdatedAt(OffsetDateTime.now());
                scheduledMapper.updateById(row);
            } catch (Exception e) {
                row.setStatus("FAILED");
                row.setLastError(trimError(e.getMessage()));
                row.setUpdatedAt(OffsetDateTime.now());
                scheduledMapper.updateById(row);
                log.warn("dispatch group scheduled message failed, id={}, error={}", row.getId(), e.getMessage());
            }
        }
    }

    private ImConversation requireMemberGroup(Long userId, Long conversationId) {
        ImConversation group = conversationMapper.selectById(conversationId);
        if (group == null || group.getType() == null || group.getType() != 2) throw new BizException("群聊不存在");
        if (!isMember(conversationId, userId)) throw new BizException("你不在该会话中");
        return group;
    }

    private ImGroupScheduledMessage requireScheduled(Long conversationId, Long scheduleId) {
        ImGroupScheduledMessage row = scheduledMapper.selectById(scheduleId);
        if (row == null || !conversationId.equals(row.getConversationId())) throw new BizException("定时消息不存在");
        return row;
    }

    private void validateScheduled(Integer msgType, String content, OffsetDateTime sendAt) {
        if (msgType == null || (msgType != 0 && msgType != 1 && msgType != 2 && msgType != 3 && msgType != MIXED_MESSAGE_TYPE)) {
            throw new BizException("定时消息只支持文字、图片/视频、文件、音频/语音或混合消息");
        }
        if (!StringUtils.hasText(content)) throw new BizException("定时消息内容不能为空");
        if (content.trim().length() > 20000) throw new BizException("定时消息内容过长");
        if (msgType == MIXED_MESSAGE_TYPE) {
            parseMixedContent(content);
        }
        if (sendAt == null || !sendAt.isAfter(OffsetDateTime.now())) throw new BizException("发送时间必须晚于当前时间");
    }

    /** Scheduled attachments use the same fileId-only message contract when dispatched. */
    private String scheduledFileId(Integer msgType, String content) {
        if (msgType == null || (msgType != 1 && msgType != 2 && msgType != 3)) return null;
        String raw = content == null ? "" : content.trim();
        if (raw.startsWith("file:")) return raw.substring("file:".length()).trim();
        try {
            JsonNode node = objectMapper.readTree(raw);
            String fileId = node == null ? "" : node.path("fileId").asText("").trim();
            return StringUtils.hasText(fileId) ? fileId : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    /**
     * 混合定时消息的存储格式：{"version":1,"items":[{"msgType":0,"content":"..."}]}。
     * 单类型历史数据仍保持原来的 content 字符串，不需要迁移。
     */
    private List<ScheduledPart> parseMixedContent(String content) {
        try {
            JsonNode root = objectMapper.readTree(content);
            JsonNode items = root == null ? null : root.get("items");
            if (items == null || !items.isArray() || items.size() < 2 || items.size() > 4) {
                throw new BizException("混合定时消息至少需要选择两种消息类型");
            }
            List<ScheduledPart> result = new ArrayList<>();
            Set<Integer> seenTypes = new HashSet<>();
            for (JsonNode item : items) {
                int msgType = item.path("msgType").asInt(item.path("type").asInt(-1));
                String itemContent = item.path("content").asText("").trim();
                if (msgType < 0 || msgType > 3 || !StringUtils.hasText(itemContent)) {
                    throw new BizException("混合定时消息内容不完整");
                }
                if (!seenTypes.add(msgType)) {
                    throw new BizException("同一条定时消息不能重复选择相同类型");
                }
                if (msgType == 0) {
                    if (itemContent.length() > 20000) throw new BizException("文字消息不能超过20000字");
                } else {
                    try {
                        JsonNode file = objectMapper.readTree(itemContent);
                        if (file == null || !StringUtils.hasText(file.path("url").asText(""))) {
                            throw new BizException("文件消息缺少文件地址");
                        }
                    } catch (BizException e) {
                        throw e;
                    } catch (Exception e) {
                        throw new BizException("文件消息内容无效");
                    }
                }
                result.add(new ScheduledPart(msgType, itemContent));
            }
            return result;
        } catch (BizException e) {
            throw e;
        } catch (Exception e) {
            throw new BizException("混合定时消息内容无效");
        }
    }

    private record ScheduledPart(int msgType, String content) {
    }

    private boolean isMember(Long conversationId, Long userId) {
        return userId != null && memberMapper.selectCount(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, userId)) > 0;
    }

    private GroupWelcomeVO toWelcomeVO(ImConversation group) {
        SysUser setter = group.getGroupWelcomeSetterId() == null ? null : userMapper.selectById(group.getGroupWelcomeSetterId());
        return GroupWelcomeVO.builder()
                .conversationId(group.getId())
                .message(group.getGroupWelcomeMessage())
                .setterId(group.getGroupWelcomeSetterId())
                .setterNickname(setter == null ? null : setter.getNickname())
                .setterAvatarUrl(setter == null ? null : setter.getAvatarUrl())
                .build();
    }

    private GroupScheduledMessageVO toScheduledVO(ImGroupScheduledMessage row) {
        SysUser setter = row.getSetterId() == null ? null : userMapper.selectById(row.getSetterId());
        return GroupScheduledMessageVO.builder()
                .id(row.getId())
                .conversationId(row.getConversationId())
                .setterId(row.getSetterId())
                .setterNickname(setter == null ? null : setter.getNickname())
                .setterAvatarUrl(setter == null ? null : setter.getAvatarUrl())
                .msgType(row.getMsgType())
                .content(row.getContent())
                .sendAt(row.getSendAt())
                .status(row.getStatus())
                .lastError(row.getLastError())
                .sentMsgId(row.getSentMsgId())
                .createdAt(row.getCreatedAt())
                .updatedAt(row.getUpdatedAt())
                .build();
    }

    private String trimError(String error) {
        if (!StringUtils.hasText(error)) return "发送失败";
        String text = error.trim();
        return text.length() > 500 ? text.substring(0, 500) : text;
    }
}
