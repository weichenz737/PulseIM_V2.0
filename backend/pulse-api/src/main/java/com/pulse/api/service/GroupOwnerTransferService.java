package com.pulse.api.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.pulse.api.entity.ImConversation;
import com.pulse.api.entity.ImGroupOwnerTransfer;
import com.pulse.api.entity.SysUser;
import com.pulse.api.mapper.ImGroupOwnerTransferMapper;
import com.pulse.api.vo.AdminGroupOwnerTransferVO;
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
public class GroupOwnerTransferService {
    private final ImGroupOwnerTransferMapper transferMapper;

    public void record(
            ImConversation group,
            SysUser fromUser,
            SysUser toUser,
            Long operatorId,
            String operatorNickname,
            String operatorType,
            String reason
    ) {
        if (group == null || fromUser == null || toUser == null) {
            return;
        }
        try {
            ImGroupOwnerTransfer t = new ImGroupOwnerTransfer();
            t.setConversationId(group.getId());
            t.setConversationTitle(group.getTitle());
            t.setFromUserId(fromUser.getId());
            t.setFromNickname(fromUser.getNickname());
            t.setFromPhone(fromUser.getPhone());
            t.setToUserId(toUser.getId());
            t.setToNickname(toUser.getNickname());
            t.setToPhone(toUser.getPhone());
            t.setOperatorId(operatorId);
            t.setOperatorNickname(truncate(operatorNickname, 64));
            t.setOperatorType(StringUtils.hasText(operatorType) ? operatorType : "user");
            t.setReason(truncate(reason, 128));
            t.setCreatedAt(OffsetDateTime.now());
            transferMapper.insert(t);
        } catch (Exception ex) {
            log.warn("write group owner transfer failed: {}", ex.getMessage());
        }
    }

    public Map<String, Object> listTransfers(int page, int size, String keyword, Long conversationId) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        LambdaQueryWrapper<ImGroupOwnerTransfer> qw = new LambdaQueryWrapper<>();
        if (conversationId != null && conversationId > 0) {
            qw.eq(ImGroupOwnerTransfer::getConversationId, conversationId);
        }
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            qw.and(w -> w.like(ImGroupOwnerTransfer::getConversationTitle, kw)
                    .or().like(ImGroupOwnerTransfer::getFromNickname, kw)
                    .or().like(ImGroupOwnerTransfer::getFromPhone, kw)
                    .or().like(ImGroupOwnerTransfer::getToNickname, kw)
                    .or().like(ImGroupOwnerTransfer::getToPhone, kw)
                    .or().like(ImGroupOwnerTransfer::getOperatorNickname, kw)
                    .or().apply("CAST(conversation_id AS TEXT) LIKE {0}", "%" + kw + "%"));
        }
        qw.orderByDesc(ImGroupOwnerTransfer::getCreatedAt).orderByDesc(ImGroupOwnerTransfer::getId);
        Page<ImGroupOwnerTransfer> result = transferMapper.selectPage(new Page<>(safePage, safeSize), qw);
        List<AdminGroupOwnerTransferVO> list = result.getRecords().stream()
                .map(this::toVO)
                .collect(Collectors.toList());
        Map<String, Object> data = new HashMap<>();
        data.put("list", list);
        data.put("total", result.getTotal());
        data.put("page", safePage);
        data.put("size", safeSize);
        return data;
    }

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
        return transferMapper.deleteBatchIds(clean);
    }

    private AdminGroupOwnerTransferVO toVO(ImGroupOwnerTransfer t) {
        return AdminGroupOwnerTransferVO.builder()
                .id(t.getId())
                .conversationId(t.getConversationId())
                .conversationTitle(t.getConversationTitle())
                .fromUserId(t.getFromUserId())
                .fromNickname(t.getFromNickname())
                .fromPhone(t.getFromPhone())
                .toUserId(t.getToUserId())
                .toNickname(t.getToNickname())
                .toPhone(t.getToPhone())
                .operatorId(t.getOperatorId())
                .operatorNickname(t.getOperatorNickname())
                .operatorType(t.getOperatorType())
                .reason(t.getReason())
                .createdAt(t.getCreatedAt())
                .build();
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }
}
