package com.pulse.api.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.pulse.api.entity.ImConversation;
import com.pulse.api.entity.ImGroupMemberEvent;
import com.pulse.api.entity.SysUser;
import com.pulse.api.mapper.ImGroupMemberEventMapper;
import com.pulse.api.vo.AdminGroupMemberEventVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class GroupMemberEventService {
    private final ImGroupMemberEventMapper eventMapper;

    public int deleteByIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return 0;
        }
        List<Long> clean = ids.stream()
                .filter(id -> id != null && id > 0)
                .distinct()
                .toList();
        if (clean.isEmpty()) {
            return 0;
        }
        return eventMapper.deleteBatchIds(clean);
    }

    public void record(
            ImConversation group,
            SysUser user,
            SysUser operator,
            String eventType,
            String source,
            String message,
            String reason,
            Long requestId
    ) {
        if (group == null || user == null || !StringUtils.hasText(eventType)) {
            return;
        }
        try {
            ImGroupMemberEvent e = new ImGroupMemberEvent();
            e.setConversationId(group.getId());
            e.setConversationTitle(group.getTitle());
            e.setUserId(user.getId());
            e.setUserNickname(user.getNickname());
            e.setUserPhone(user.getPhone());
            if (operator != null) {
                e.setOperatorId(operator.getId());
                e.setOperatorNickname(operator.getNickname());
            }
            e.setEventType(eventType);
            e.setSource(source);
            e.setMessage(truncate(message, 128));
            e.setReason(truncate(reason, 128));
            e.setRequestId(requestId);
            e.setCreatedAt(OffsetDateTime.now());
            eventMapper.insert(e);
        } catch (Exception ex) {
            log.warn("write group member event failed: {}", ex.getMessage());
        }
    }

    public Map<String, Object> listEvents(int page, int size, String keyword, Long conversationId, String eventType) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        LambdaQueryWrapper<ImGroupMemberEvent> qw = new LambdaQueryWrapper<>();
        if (conversationId != null) {
            qw.eq(ImGroupMemberEvent::getConversationId, conversationId);
        }
        if (StringUtils.hasText(eventType)) {
            qw.eq(ImGroupMemberEvent::getEventType, eventType.trim());
        }
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            qw.and(w -> w.like(ImGroupMemberEvent::getConversationTitle, kw)
                    .or().like(ImGroupMemberEvent::getUserNickname, kw)
                    .or().like(ImGroupMemberEvent::getUserPhone, kw)
                    .or().like(ImGroupMemberEvent::getMessage, kw)
                    .or().like(ImGroupMemberEvent::getReason, kw)
                    .or().apply("CAST(conversation_id AS TEXT) LIKE {0}", "%" + kw + "%"));
        }
        qw.orderByDesc(ImGroupMemberEvent::getId);
        Page<ImGroupMemberEvent> result = eventMapper.selectPage(new Page<>(safePage, safeSize), qw);
        List<AdminGroupMemberEventVO> list = result.getRecords().stream()
                .map(this::toVO)
                .collect(Collectors.toList());
        Map<String, Object> data = new HashMap<>();
        data.put("list", list);
        data.put("total", result.getTotal());
        data.put("page", safePage);
        data.put("size", safeSize);
        return data;
    }

    /** 用户端群通知：仅返回与当前用户本人相关的事件，不暴露手机号。 */
    public List<Map<String, Object>> listUserNotifications(Long userId) {
        if (userId == null) return List.of();
        List<ImGroupMemberEvent> rows = eventMapper.selectList(
                new LambdaQueryWrapper<ImGroupMemberEvent>()
                        .eq(ImGroupMemberEvent::getUserId, userId)
                        .in(ImGroupMemberEvent::getEventType,
                                "kick", "dissolve", "role_admin", "role_member", "role_owner")
                        .orderByDesc(ImGroupMemberEvent::getId)
                        .last("LIMIT 100"));
        return rows.stream().map(e -> {
            Map<String, Object> item = new HashMap<>();
            item.put("id", e.getId());
            item.put("conversationId", e.getConversationId());
            item.put("groupTitle", e.getConversationTitle());
            item.put("eventType", e.getEventType());
            item.put("operatorNickname", e.getOperatorNickname());
            item.put("source", e.getSource());
            item.put("reason", e.getReason());
            item.put("createdAt", e.getCreatedAt());
            return item;
        }).toList();
    }

    private AdminGroupMemberEventVO toVO(ImGroupMemberEvent e) {
        return AdminGroupMemberEventVO.builder()
                .id(e.getId())
                .conversationId(e.getConversationId())
                .conversationTitle(e.getConversationTitle())
                .userId(e.getUserId())
                .userNickname(e.getUserNickname())
                .userPhone(e.getUserPhone())
                .operatorId(e.getOperatorId())
                .operatorNickname(e.getOperatorNickname())
                .eventType(e.getEventType())
                .source(e.getSource())
                .message(e.getMessage())
                .reason(e.getReason())
                .requestId(e.getRequestId())
                .createdAt(e.getCreatedAt())
                .build();
    }

    private String truncate(String value, int max) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        String v = value.trim();
        return v.length() <= max ? v : v.substring(0, max);
    }
}
