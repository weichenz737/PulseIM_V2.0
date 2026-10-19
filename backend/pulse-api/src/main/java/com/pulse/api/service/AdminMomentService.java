package com.pulse.api.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.pulse.api.entity.MomentComment;
import com.pulse.api.entity.MomentInteraction;
import com.pulse.api.entity.MomentLike;
import com.pulse.api.entity.MomentPost;
import com.pulse.api.entity.SysUser;
import com.pulse.api.mapper.MomentCommentMapper;
import com.pulse.api.mapper.MomentInteractionMapper;
import com.pulse.api.mapper.MomentLikeMapper;
import com.pulse.api.mapper.MomentPostMapper;
import com.pulse.api.mapper.SysUserMapper;
import com.pulse.api.vo.AdminMomentVO;
import com.pulse.api.vo.MomentCommentVO;
import com.pulse.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AdminMomentService {
    private final MomentPostMapper momentPostMapper;
    private final MomentLikeMapper momentLikeMapper;
    private final MomentCommentMapper momentCommentMapper;
    private final MomentInteractionMapper momentInteractionMapper;
    private final SysUserMapper userMapper;

    public Map<String, Object> listMoments(int page, int size, String keyword, String status) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);

        LambdaQueryWrapper<MomentPost> qw = new LambdaQueryWrapper<>();
        applyStatusFilter(qw, status);
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            Set<Long> userIds = findUserIdsByKeyword(kw);
            qw.and(w -> {
                w.like(MomentPost::getContent, kw)
                        .or().apply("CAST(id AS TEXT) LIKE {0}", "%" + kw + "%")
                        .or().apply("CAST(user_id AS TEXT) LIKE {0}", "%" + kw + "%");
                if (!userIds.isEmpty()) {
                    w.or().in(MomentPost::getUserId, userIds);
                }
            });
        }
        qw.orderByDesc(MomentPost::getCreatedAt).orderByDesc(MomentPost::getId);

        Page<MomentPost> result = momentPostMapper.selectPage(new Page<>(safePage, safeSize), qw);
        List<MomentPost> records = result.getRecords();
        Map<Long, SysUser> users = loadUsers(records.stream()
                .map(MomentPost::getUserId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet()));

        List<AdminMomentVO> list = records.stream()
                .map(p -> toListVO(p, users.get(p.getUserId())))
                .collect(Collectors.toList());

        Map<String, Object> data = new HashMap<>();
        data.put("list", list);
        data.put("total", result.getTotal());
        data.put("page", safePage);
        data.put("size", safeSize);
        return data;
    }

    public AdminMomentVO getMoment(Long id) {
        MomentPost post = momentPostMapper.selectById(id);
        if (post == null) {
            throw new BizException("动态不存在");
        }
        SysUser user = post.getUserId() == null ? null : userMapper.selectById(post.getUserId());
        return toDetailVO(post, user);
    }

    @Transactional
    public void deleteMoment(Long id) {
        MomentPost post = momentPostMapper.selectById(id);
        if (post == null) {
            throw new BizException("动态不存在");
        }
        softDelete(post, "admin");
    }

    @Transactional
    public int deleteMoments(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return 0;
        }
        int n = 0;
        for (Long id : ids) {
            if (id == null) continue;
            MomentPost post = momentPostMapper.selectById(id);
            if (post == null) continue;
            if (softDelete(post, "admin")) {
                n++;
            }
        }
        return n;
    }

    /** @return true if newly soft-deleted */
    boolean softDelete(MomentPost post, String by) {
        if (post == null || post.getId() == null) {
            return false;
        }
        if (Boolean.TRUE.equals(post.getRemoved())) {
            // 用户已删时，管理员再删仅更新删除方标记
            if ("admin".equals(by) && !"admin".equals(post.getRemovedBy())) {
                post.setRemovedBy("admin");
                post.setRemovedAt(OffsetDateTime.now());
                momentPostMapper.updateById(post);
                return true;
            }
            return false;
        }
        post.setRemoved(true);
        post.setRemovedAt(OffsetDateTime.now());
        post.setRemovedBy(StringUtils.hasText(by) ? by : "admin");
        momentPostMapper.updateById(post);
        momentInteractionMapper.delete(new LambdaQueryWrapper<MomentInteraction>()
                .eq(MomentInteraction::getPostId, post.getId()));
        return true;
    }

    private void applyStatusFilter(LambdaQueryWrapper<MomentPost> qw, String status) {
        if (!StringUtils.hasText(status)) {
            return;
        }
        String s = status.trim().toLowerCase();
        if ("normal".equals(s)) {
            qw.and(w -> w.isNull(MomentPost::getRemoved).or().eq(MomentPost::getRemoved, false));
        } else if ("user_deleted".equals(s)) {
            qw.eq(MomentPost::getRemoved, true).eq(MomentPost::getRemovedBy, "user");
        } else if ("admin_deleted".equals(s)) {
            qw.eq(MomentPost::getRemoved, true).eq(MomentPost::getRemovedBy, "admin");
        } else if ("deleted".equals(s)) {
            qw.eq(MomentPost::getRemoved, true);
        }
    }

    private Set<Long> findUserIdsByKeyword(String kw) {
        List<SysUser> users = userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                .and(w -> w.like(SysUser::getNickname, kw)
                        .or().like(SysUser::getPhone, kw)
                        .or().like(SysUser::getPulseId, kw))
                .last("LIMIT 50"));
        Set<Long> ids = new HashSet<>();
        for (SysUser u : users) {
            if (u.getId() != null) ids.add(u.getId());
        }
        return ids;
    }

    private Map<Long, SysUser> loadUsers(Set<Long> ids) {
        Map<Long, SysUser> map = new HashMap<>();
        if (ids == null || ids.isEmpty()) return map;
        List<SysUser> users = userMapper.selectBatchIds(ids);
        for (SysUser u : users) {
            if (u.getId() != null) map.put(u.getId(), u);
        }
        return map;
    }

    private AdminMomentVO toListVO(MomentPost p, SysUser u) {
        return AdminMomentVO.builder()
                .id(p.getId())
                .userId(p.getUserId())
                .nickname(u == null ? null : u.getNickname())
                .phone(u == null ? null : u.getPhone())
                .pulseId(u == null ? null : u.getPulseId())
                .avatarUrl(u == null ? null : u.getAvatarUrl())
                .content(p.getContent())
                .images(parseImages(p.getImages()))
                .originalImages(parseImages(p.getOriginalImages()))
                .mediaTypes(parseImages(p.getMediaTypes()))
                .mediaFileIds(parseImages(p.getMediaFileIds()))
                .visibility(p.getVisibility() == null ? 0 : p.getVisibility())
                .visibilityLabel(visibilityLabel(p.getVisibility()))
                .likeCount(p.getLikeCount() == null ? 0 : p.getLikeCount())
                .commentCount(p.getCommentCount() == null ? 0 : p.getCommentCount())
                .status(statusOf(p))
                .statusLabel(statusLabel(p))
                .removedAt(p.getRemovedAt())
                .removedBy(p.getRemovedBy())
                .createdAt(p.getCreatedAt())
                .build();
    }

    private AdminMomentVO toDetailVO(MomentPost p, SysUser u) {
        AdminMomentVO vo = toListVO(p, u);
        vo.setLikeNicknames(loadLikeNicknames(p.getId()));
        vo.setComments(loadComments(p.getId()));
        vo.setMentionNicknames(loadMentionNicknames(p.getMentionUserIds()));
        return vo;
    }

    private List<String> loadLikeNicknames(Long postId) {
        if (postId == null) return List.of();
        List<MomentLike> likes = momentLikeMapper.selectList(new LambdaQueryWrapper<MomentLike>()
                .eq(MomentLike::getPostId, postId)
                .orderByAsc(MomentLike::getId)
                .last("LIMIT 50"));
        List<String> names = new ArrayList<>();
        for (MomentLike like : likes) {
            SysUser lu = userMapper.selectById(like.getUserId());
            names.add(lu != null && StringUtils.hasText(lu.getNickname())
                    ? lu.getNickname()
                    : ("用户" + like.getUserId()));
        }
        return names;
    }

    private List<MomentCommentVO> loadComments(Long postId) {
        if (postId == null) return List.of();
        List<MomentComment> list = momentCommentMapper.selectList(new LambdaQueryWrapper<MomentComment>()
                .eq(MomentComment::getPostId, postId)
                .orderByAsc(MomentComment::getId)
                .last("LIMIT 100"));
        Map<Long, MomentComment> byId = new HashMap<>();
        for (MomentComment c : list) {
            if (c.getId() != null) byId.put(c.getId(), c);
        }
        List<MomentCommentVO> out = new ArrayList<>();
        for (MomentComment c : list) {
            SysUser cu = userMapper.selectById(c.getUserId());
            Long replyToId = c.getReplyToCommentId();
            Long replyToUserId = null;
            String replyToNickname = null;
            if (replyToId != null) {
                MomentComment parent = byId.get(replyToId);
                if (parent == null) {
                    parent = momentCommentMapper.selectById(replyToId);
                }
                if (parent != null) {
                    replyToUserId = parent.getUserId();
                    SysUser pu = userMapper.selectById(parent.getUserId());
                    replyToNickname = pu != null && StringUtils.hasText(pu.getNickname())
                            ? pu.getNickname()
                            : ("用户" + parent.getUserId());
                }
            }
            out.add(MomentCommentVO.builder()
                    .id(c.getId())
                    .userId(c.getUserId())
                    .nickname(cu != null && StringUtils.hasText(cu.getNickname())
                            ? cu.getNickname()
                            : ("用户" + c.getUserId()))
                    .avatarUrl(cu != null ? cu.getAvatarUrl() : null)
                    .content(c.getContent())
                    .replyToCommentId(replyToId)
                    .replyToUserId(replyToUserId)
                    .replyToNickname(replyToNickname)
                    .imageUrl(c.getImageUrl())
                    .imageFileId(c.getImageFileId())
                    .createdAt(c.getCreatedAt())
                    .build());
        }
        return out;
    }

    private List<String> loadMentionNicknames(String raw) {
        List<Long> ids = parseIdList(raw);
        List<String> names = new ArrayList<>();
        for (Long id : ids) {
            SysUser u = userMapper.selectById(id);
            names.add(u != null && StringUtils.hasText(u.getNickname()) ? u.getNickname() : ("用户" + id));
        }
        return names;
    }

    private List<String> parseImages(String raw) {
        if (!StringUtils.hasText(raw)) return List.of();
        return Arrays.stream(raw.split(",")).filter(StringUtils::hasText).toList();
    }

    private List<Long> parseIdList(String raw) {
        if (!StringUtils.hasText(raw)) return List.of();
        List<Long> ids = new ArrayList<>();
        for (String part : raw.split(",")) {
            if (!StringUtils.hasText(part)) continue;
            try {
                ids.add(Long.valueOf(part.trim()));
            } catch (Exception ignored) {
                // skip
            }
        }
        return ids;
    }

    private String visibilityLabel(Integer visibility) {
        int v = visibility == null ? 0 : visibility;
        if (v == 1) return "仅自己";
        if (v == 2) return "部分可见";
        return "好友可见";
    }

    private String statusOf(MomentPost p) {
        if (!Boolean.TRUE.equals(p.getRemoved())) {
            return "normal";
        }
        if ("admin".equalsIgnoreCase(p.getRemovedBy())) {
            return "admin_deleted";
        }
        return "user_deleted";
    }

    private String statusLabel(MomentPost p) {
        String s = statusOf(p);
        if ("admin_deleted".equals(s)) return "管理员已删";
        if ("user_deleted".equals(s)) return "用户已删";
        return "正常";
    }
}
