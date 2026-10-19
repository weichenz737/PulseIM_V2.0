package com.pulse.api.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pulse.api.entity.ImCallLog;
import com.pulse.api.entity.ImConversationMember;
import com.pulse.api.entity.ImConversation;
import com.pulse.api.entity.ImMessage;
import com.pulse.api.entity.SysUser;
import com.pulse.api.mapper.ImCallLogMapper;
import com.pulse.api.mapper.ImConversationMemberMapper;
import com.pulse.api.mapper.ImConversationMapper;
import com.pulse.api.mapper.SysUserMapper;
import com.pulse.api.vo.AdminCallLogVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class CallLogService {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Pattern DURATION_TEXT = Pattern.compile("通话时长\\s*(\\d{1,2}):(\\d{2})");

    private final ImCallLogMapper callLogMapper;
    private final ImConversationMemberMapper memberMapper;
    private final ImConversationMapper conversationMapper;
    private final SysUserMapper userMapper;

    public void recordGroupCall(Long userId, Map<String, Object> body) {
        if (userId == null || body == null) return;
        String callId = value(body.get("callId"));
        Long conversationId = longValue(body.get("conversationId"));
        if (!StringUtils.hasText(callId) || callId.length() > 64 || conversationId == null) return;

        ImConversation conversation = conversationMapper.selectById(conversationId);
        if (conversation == null || !Objects.equals(conversation.getType(), 2)) return;
        Long memberCount = memberMapper.selectCount(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, userId));
        if (memberCount == null || memberCount <= 0) return;

        String event = value(body.get("event"));
        ImCallLog row = callLogMapper.selectOne(new LambdaQueryWrapper<ImCallLog>()
                .eq(ImCallLog::getCallId, callId).last("LIMIT 1"));
        if (row == null) {
            row = new ImCallLog();
            row.setCallId(callId);
            row.setConversationId(conversationId);
            row.setCallerId(userId);
            row.setRecorderId(userId);
            row.setMediaType("video".equals(value(body.get("mediaType"))) ? "video" : "audio");
            row.setCallType("group");
            row.setGroupTitle(truncate(conversation.getTitle(), 128));
            row.setParticipantCount(Math.max(1, intValue(body.get("participantCount"))));
            row.setConnected(false);
            row.setDurationSec(0);
            row.setReason("started");
            row.setResultText("群通话发起");
            row.setCreatedAt(OffsetDateTime.now());
            try {
                callLogMapper.insert(row);
            } catch (Exception e) {
                log.warn("insert group call log failed callId={}: {}", callId, e.getMessage());
            }
            return;
        }
        if (!Objects.equals(row.getCallerId(), userId) || !"group".equals(row.getCallType())) return;
        row.setParticipantCount(Math.max(
                row.getParticipantCount() == null ? 1 : row.getParticipantCount(),
                Math.max(1, intValue(body.get("participantCount")))));
        if ("end".equals(event)) {
            int duration = Math.max(0, intValue(body.get("durationSec")));
            row.setDurationSec(duration);
            row.setConnected(row.getParticipantCount() > 1);
            row.setReason("hangup");
            row.setResultText("群通话时长 " + formatDuration(duration));
        }
        callLogMapper.updateById(row);
    }

    /**
     * 从通话系统提示落库（幂等：同一 callId 只记一次）。不含语音媒体。
     */
    public void recordFromCallTip(ImMessage message, Long peerUserId) {
        if (message == null || !StringUtils.hasText(message.getClientMsgId())) {
            return;
        }
        String clientMsgId = message.getClientMsgId().trim();
        if (!clientMsgId.startsWith("callrec_") || clientMsgId.length() <= 8) {
            return;
        }
        if (message.getMsgType() == null || message.getMsgType() != 9) {
            return;
        }
        String callId = clientMsgId.substring("callrec_".length());
        Long exists = callLogMapper.selectCount(new LambdaQueryWrapper<ImCallLog>()
                .eq(ImCallLog::getCallId, callId));
        if (exists != null && exists > 0) {
            return;
        }

        ParsedCall parsed = parseCallContent(message.getContent());
        Long recorderId = message.getFromUserId();
        Long peerId = peerUserId;
        if (peerId == null || peerId <= 0) {
            peerId = parsed.peerUserId;
        }
        if (peerId == null || peerId <= 0) {
            peerId = resolvePeerFromConversation(message.getConversationId(), recorderId);
        }

        Long callerId = recorderId;
        Long calleeId = peerId;
        if ("callee".equalsIgnoreCase(parsed.role) && peerId != null && peerId > 0) {
            callerId = peerId;
            calleeId = recorderId;
        }

        ImCallLog row = new ImCallLog();
        row.setCallId(callId);
        row.setConversationId(message.getConversationId());
        row.setCallerId(callerId);
        row.setCalleeId(calleeId);
        row.setRecorderId(recorderId);
        row.setReason(truncate(parsed.reason, 32));
        row.setResultText(truncate(parsed.text, 128));
        row.setConnected(parsed.connected);
        row.setDurationSec(Math.max(0, parsed.durationSec));
        row.setMediaType("video".equals(parsed.mediaType) ? "video" : "audio");
        row.setCreatedAt(message.getSendTime() != null ? message.getSendTime() : OffsetDateTime.now());
        try {
            callLogMapper.insert(row);
        } catch (Exception e) {
            log.warn("insert call log failed callId={}: {}", callId, e.getMessage());
        }
    }

    /** 私聊会话中解析对方用户 */
    private Long resolvePeerFromConversation(Long conversationId, Long selfUserId) {
        if (conversationId == null || selfUserId == null) {
            return null;
        }
        ImConversationMember mine = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, selfUserId)
                .last("LIMIT 1"));
        if (mine != null && mine.getPeerUserId() != null && mine.getPeerUserId() > 0) {
            return mine.getPeerUserId();
        }
        ImConversationMember other = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .ne(ImConversationMember::getUserId, selfUserId)
                .last("LIMIT 1"));
        return other == null ? null : other.getUserId();
    }

    public int deleteByIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return 0;
        }
        List<Long> clean = ids.stream()
                .filter(Objects::nonNull)
                .filter(id -> id > 0)
                .distinct()
                .toList();
        if (clean.isEmpty()) {
            return 0;
        }
        return callLogMapper.deleteBatchIds(clean);
    }

    public Map<String, Object> listLogs(
            int page,
            int size,
            String keyword,
            Long conversationId,
            Long userId,
            Boolean connected,
            String reason,
            String mediaType
    ) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        LambdaQueryWrapper<ImCallLog> qw = new LambdaQueryWrapper<>();
        if (conversationId != null) {
            qw.eq(ImCallLog::getConversationId, conversationId);
        }
        if (userId != null) {
            qw.and(w -> w.eq(ImCallLog::getCallerId, userId).or().eq(ImCallLog::getCalleeId, userId));
        }
        if (connected != null) {
            qw.eq(ImCallLog::getConnected, connected);
        }
        if (StringUtils.hasText(reason)) {
            qw.eq(ImCallLog::getReason, reason.trim());
        }
        if (StringUtils.hasText(mediaType)) {
            String mt = mediaType.trim().toLowerCase();
            if ("video".equals(mt) || "audio".equals(mt) || "voice".equals(mt)) {
                qw.eq(ImCallLog::getMediaType, "voice".equals(mt) ? "audio" : mt);
            }
        }
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            qw.and(w -> w.like(ImCallLog::getResultText, kw)
                    .or().like(ImCallLog::getCallId, kw)
                    .or().like(ImCallLog::getReason, kw)
                    .or().apply("CAST(conversation_id AS TEXT) LIKE {0}", "%" + kw + "%")
                    .or().apply("CAST(caller_id AS TEXT) LIKE {0}", "%" + kw + "%")
                    .or().apply("CAST(callee_id AS TEXT) LIKE {0}", "%" + kw + "%"));
        }
        qw.orderByDesc(ImCallLog::getId);
        Page<ImCallLog> result = callLogMapper.selectPage(new Page<>(safePage, safeSize), qw);

        Set<Long> userIds = new HashSet<>();
        for (ImCallLog row : result.getRecords()) {
            if (row.getCallerId() != null) userIds.add(row.getCallerId());
            if (row.getCalleeId() != null) userIds.add(row.getCalleeId());
        }
        Map<Long, SysUser> users = loadUsers(userIds);

        List<AdminCallLogVO> list = result.getRecords().stream()
                .map(row -> toVO(row, users))
                .collect(Collectors.toList());

        Map<String, Object> data = new HashMap<>();
        data.put("list", list);
        data.put("total", result.getTotal());
        data.put("page", safePage);
        data.put("size", safeSize);
        return data;
    }

    private AdminCallLogVO toVO(ImCallLog row, Map<Long, SysUser> users) {
        SysUser caller = row.getCallerId() == null ? null : users.get(row.getCallerId());
        SysUser callee = row.getCalleeId() == null ? null : users.get(row.getCalleeId());
        int duration = row.getDurationSec() == null ? 0 : Math.max(0, row.getDurationSec());
        String media = "video".equalsIgnoreCase(row.getMediaType()) ? "video" : "audio";
        return AdminCallLogVO.builder()
                .id(row.getId())
                .callId(row.getCallId())
                .conversationId(row.getConversationId())
                .callerId(row.getCallerId())
                .callerNickname(caller == null ? null : caller.getNickname())
                .callerPhone(caller == null ? null : caller.getPhone())
                .calleeId(row.getCalleeId())
                .calleeNickname(callee == null ? null : callee.getNickname())
                .calleePhone(callee == null ? null : callee.getPhone())
                .recorderId(row.getRecorderId())
                .reason(row.getReason())
                .resultText(row.getResultText())
                .connected(Boolean.TRUE.equals(row.getConnected()))
                .durationSec(duration)
                .durationText(formatDuration(duration))
                .mediaType(media)
                .mediaTypeLabel("video".equals(media) ? "视频通话" : "语音通话")
                .callType("group".equals(row.getCallType()) ? "group" : "private")
                .groupTitle(row.getGroupTitle())
                .participantCount(row.getParticipantCount() == null ? 0 : row.getParticipantCount())
                .createdAt(row.getCreatedAt())
                .build();
    }

    private Map<Long, SysUser> loadUsers(Set<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return Map.of();
        }
        List<SysUser> list = userMapper.selectBatchIds(ids);
        Map<Long, SysUser> map = new HashMap<>();
        for (SysUser u : list) {
            map.put(u.getId(), u);
        }
        return map;
    }

    static ParsedCall parseCallContent(String content) {
        ParsedCall p = new ParsedCall();
        if (!StringUtils.hasText(content)) {
            p.text = "通话已结束";
            return p;
        }
        String raw = content.trim();
        if (raw.startsWith("{")) {
            try {
                JsonNode n = MAPPER.readTree(raw);
                if ("voice_call".equals(n.path("kind").asText())
                        || "video_call".equals(n.path("kind").asText())
                        || n.has("callId")
                        || n.has("text")) {
                    p.text = n.path("text").asText(null);
                    if (!StringUtils.hasText(p.text)) {
                        p.text = "通话已结束";
                    }
                    String kind = n.path("kind").asText("");
                    String media = n.path("mediaType").asText("");
                    if ("video_call".equals(kind) || "video".equalsIgnoreCase(media)) {
                        p.mediaType = "video";
                    } else {
                        p.mediaType = "audio";
                    }
                    p.reason = blankToNull(n.path("reason").asText(null));
                    p.role = blankToNull(n.path("role").asText(null));
                    p.connected = n.path("connected").asBoolean(false)
                            || n.path("wasConnected").asBoolean(false);
                    p.durationSec = n.path("durationSec").asInt(0);
                    if (p.durationSec <= 0 && p.connected) {
                        p.durationSec = parseDurationFromText(p.text);
                    }
                    long peer = n.path("peerUserId").asLong(0);
                    if (peer <= 0) {
                        peer = n.path("toUserId").asLong(0);
                    }
                    if (peer > 0) {
                        p.peerUserId = peer;
                    }
                    return p;
                }
            } catch (Exception ignored) {
                // fall through
            }
        }
        p.text = raw;
        p.connected = raw.startsWith("通话时长");
        p.durationSec = parseDurationFromText(raw);
        p.reason = inferReasonFromText(raw);
        return p;
    }

    /** 供聊天展示：优先取 JSON.text */
    public static String displayCallText(String content) {
        return parseCallContent(content).text;
    }

    /** 会话列表 / 系统 tip：带 [语音通话] / [视频通话] 前缀 */
    public static String displayCallPreview(String content) {
        ParsedCall p = parseCallContent(content);
        String text = StringUtils.hasText(p.text) ? p.text : "通话已结束";
        String tag = "video".equals(p.mediaType) ? "[视频通话]" : "[语音通话]";
        return tag + " " + text;
    }

    public static boolean looksLikeCallTip(String content, String clientMsgId) {
        if (StringUtils.hasText(clientMsgId) && clientMsgId.startsWith("callrec_")) {
            return true;
        }
        if (!StringUtils.hasText(content)) {
            return false;
        }
        String c = content.trim();
        if (c.startsWith("{")) {
            try {
                JsonNode n = MAPPER.readTree(c);
                return "voice_call".equals(n.path("kind").asText())
                        || "video_call".equals(n.path("kind").asText());
            } catch (Exception e) {
                return false;
            }
        }
        return c.startsWith("通话") || c.contains("已拒绝") || c.contains("未接")
                || c.contains("忙线") || c.contains("无应答") || c.contains("已取消")
                || c.contains("不在线") || c.contains("通话中断") || Objects.equals(c, "通话已结束")
                || c.contains("对方已取消");
    }

    private static int parseDurationFromText(String text) {
        if (!StringUtils.hasText(text)) {
            return 0;
        }
        Matcher m = DURATION_TEXT.matcher(text);
        if (!m.find()) {
            return 0;
        }
        try {
            return Integer.parseInt(m.group(1)) * 60 + Integer.parseInt(m.group(2));
        } catch (Exception e) {
            return 0;
        }
    }

    private static String inferReasonFromText(String text) {
        if (!StringUtils.hasText(text)) return null;
        if (text.contains("已拒绝")) return "rejected";
        if (text.contains("未接") || text.contains("无应答")) return "timeout";
        if (text.contains("忙线")) return "busy";
        if (text.contains("不在线")) return "unavailable";
        if (text.contains("已取消") || text.contains("对方已取消")) return "hangup";
        if (text.contains("中断")) return "error";
        if (text.startsWith("通话时长")) return "hangup";
        return null;
    }

    private static String formatDuration(int sec) {
        int s = Math.max(0, sec);
        int m = s / 60;
        int r = s % 60;
        return String.format("%02d:%02d", m, r);
    }

    private static String truncate(String value, int max) {
        if (!StringUtils.hasText(value)) return null;
        String v = value.trim();
        return v.length() <= max ? v : v.substring(0, max);
    }

    private static String blankToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private static String value(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static Long longValue(Object value) {
        try {
            long n = Long.parseLong(CallLogService.value(value));
            return n > 0 ? n : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static int intValue(Object value) {
        try {
            return Integer.parseInt(CallLogService.value(value));
        } catch (Exception e) {
            return 0;
        }
    }

    static class ParsedCall {
        String text;
        String reason;
        String role;
        /** audio | video */
        String mediaType = "audio";
        boolean connected;
        int durationSec;
        Long peerUserId;
    }
}
