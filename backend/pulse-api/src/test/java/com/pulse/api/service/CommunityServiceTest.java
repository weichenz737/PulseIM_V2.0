package com.pulse.api.service;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CommunityServiceTest {
    @Test
    void memberListWithoutKeywordDoesNotBindAnUntypedNull() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("allowed", 1)))
                .thenReturn(List.of());
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        service.members(7L, 9L, null);

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc, times(2)).queryForList(sql.capture(), args.capture());
        assertThat(sql.getAllValues().get(1)).doesNotContain("? IS NULL");
        assertThat(args.getAllValues().get(1)).containsExactly(9L);
    }

    @Test
    void memberListWithKeywordBindsOnlySearchPatterns() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("allowed", 1)))
                .thenReturn(List.of());
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        service.members(7L, 9L, " Alice ");

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc, times(2)).queryForList(sql.capture(), args.capture());
        assertThat(sql.getAllValues().get(1)).contains("u.nickname ILIKE ? OR u.phone ILIKE ?");
        assertThat(args.getAllValues().get(1)).containsExactly(9L, "%Alice%", "%Alice%");
    }

    @Test
    void postDetailReturnsPostFieldsCommentsAndDeletePermission() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        Map<String,Object> metadata = Map.of("community_id", 9L, "user_id", 7L, "status", "PUBLISHED");
        Map<String,Object> post = Map.of("id", 41L, "community_id", 9L, "original_images", "[]", "media_types", "[]");
        Map<String,Object> comment = Map.of("id", 51L, "like_count", 2L, "liked_by_me", true);
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(metadata))
                .thenReturn(List.of(Map.of("member", 1)))
                .thenReturn(List.of(post))
                .thenReturn(List.of(comment));
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        Map<String,Object> result = service.postDetail(7L, 41L);

        assertThat(result).containsEntry("id", 41L).containsEntry("can_delete", true);
        assertThat(result.get("comments")).isEqualTo(List.of(comment));
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc, times(4)).queryForList(sql.capture(), any(Object[].class));
        assertThat(sql.getAllValues().get(2)).contains("original_images", "favorited_by_me");
        assertThat(sql.getAllValues().get(3)).contains("community_post_comment_like", "liked_by_me");
    }

    @Test
    void postListAlwaysExcludesDeletedPostsIncludingAuthorsOwnPosts() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("member", 1)))
                .thenReturn(List.of());
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        service.posts(7L, 9L);

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc, times(2)).queryForList(sql.capture(), any(Object[].class));
        assertThat(sql.getAllValues().get(1)).contains("p.status<>'DELETED'", "p.user_id=? AND p.status='PENDING'");
        assertThat(sql.getAllValues().get(1)).contains("p.pinned DESC", "p.pinned_at DESC NULLS LAST");
    }

    @Test
    void ownerOrAdminCanPinPostAndAuthorIsNotified() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of(
                        "id", 41L, "community_id", 9L, "user_id", 88L,
                        "status", "PUBLISHED", "pinned", false)))
                .thenReturn(List.of(Map.of("manager", 1)));
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);
        when(jdbc.queryForObject(contains("COALESCE(NULLIF(nickname"), eq(String.class), eq(7L))).thenReturn("圈主");
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        Map<String,Object> result = service.setPostPinned(7L, 41L, true);

        assertThat(result).containsEntry("pinned", true);
        verify(jdbc).update(contains("pinned_at=CASE WHEN ? THEN NOW()"), eq(true), eq(true), eq(7L), eq(41L));
        verify(jdbc).update(contains("community_notification"), eq(88L), eq(9L), eq(41L), eq(null), eq(7L),
                eq("POST_PINNED"), eq("圈主置顶了你的圈子动态"), eq("圈主或管理员置顶了你的动态"));
    }

    @Test
    void mutingCommunityMemberCreatesNotification() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("allowed", 1)))
                .thenReturn(List.of(Map.of(
                        "user_id", 88L, "previous_status", "ACTIVE", "community_name", "摄影圈")));
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);
        when(jdbc.queryForObject(contains("COALESCE(NULLIF(nickname"), eq(String.class), eq(7L))).thenReturn("管理员");
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        service.setMemberStatus(7L, 9L, 51L, "MUTED");

        verify(jdbc).update(contains("community_notification"), eq(88L), eq(9L), eq(null), eq(null), eq(7L),
                eq("MEMBER_MUTED"), eq("管理员将你禁言"), eq("你在圈子“摄影圈”中已被禁言 7 天"));
    }

    @Test
    void managePostListIncludesReviewStatesButExcludesDeleted() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        Map<String,Object> pending = Map.of("id", 41L, "status", "PENDING");
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("manager", 1)))
                .thenReturn(List.of(pending));
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        List<Map<String,Object>> result = service.managePosts(7L, 9L);

        assertThat(result).containsExactly(pending);
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc, times(2)).queryForList(sql.capture(), any(Object[].class));
        assertThat(sql.getAllValues().get(1)).contains(
                "p.status IN('PENDING','PUBLISHED','BLOCKED')", "original_images", "location_name", "u.nickname");
        assertThat(sql.getAllValues().get(1)).doesNotContain("DELETED");
    }

    @Test
    void regularMemberCannotReadManagePostList() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        assertThatThrownBy(() -> service.managePosts(7L, 9L))
                .isInstanceOf(com.pulse.common.exception.BizException.class)
                .hasMessageContaining("无管理权限");
        verify(jdbc, times(1)).queryForList(anyString(), any(Object[].class));
    }

    @Test
    void deletedPostDetailIsHiddenFromItsAuthor() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("community_id", 9L, "user_id", 7L, "status", "DELETED")));
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        assertThatThrownBy(() -> service.postDetail(7L, 41L))
                .isInstanceOf(com.pulse.common.exception.BizException.class)
                .hasMessageContaining("动态不存在");
        verify(jdbc, times(1)).queryForList(anyString(), any(Object[].class));
    }

    @Test
    void blockedPostDetailIsHiddenFromRegularAuthor() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("community_id", 9L, "user_id", 7L, "status", "BLOCKED")))
                .thenReturn(List.of(Map.of("member", 1)))
                .thenReturn(List.of());
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        assertThatThrownBy(() -> service.postDetail(7L, 41L))
                .isInstanceOf(com.pulse.common.exception.BizException.class)
                .hasMessageContaining("动态不存在");
        verify(jdbc, times(3)).queryForList(anyString(), any(Object[].class));
    }

    @Test
    void postAuthorCanDeletePublishedPostAndPostCountIsDecremented() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("community_id", 9L, "user_id", 7L, "status", "PUBLISHED")));
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        service.deletePost(7L, 41L);

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc, times(2)).update(sql.capture(), args.capture());
        assertThat(sql.getAllValues().get(0)).contains("status='DELETED'");
        assertThat(args.getAllValues().get(0)).containsExactly(41L);
        assertThat(sql.getAllValues().get(1)).contains("post_count=GREATEST(post_count-1,0)");
        assertThat(args.getAllValues().get(1)).containsExactly(9L);
    }

    @Test
    void adminCanDeleteRegularMembersPost() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of(
                        "community_id", 9L, "user_id", 88L, "status", "PENDING",
                        "author_role", "MEMBER", "my_role", "ADMIN", "my_permissions", "CONTENT")));
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        service.deletePost(7L, 41L);

        verify(jdbc).update(contains("status='DELETED'"), eq(41L));
        verify(jdbc, never()).update(contains("post_count=GREATEST"), any(Object[].class));
    }

    @Test
    void adminCannotDeleteOwnersPost() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(Map.of(
                "community_id", 9L, "user_id", 88L, "status", "PUBLISHED",
                "author_role", "OWNER", "my_role", "ADMIN", "my_permissions", "CONTENT")));
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        assertThatThrownBy(() -> service.deletePost(7L, 41L))
                .isInstanceOf(com.pulse.common.exception.BizException.class)
                .hasMessageContaining("管理员不能删除圈主");
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void adminCannotDeleteAnotherAdminsPost() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(Map.of(
                "community_id", 9L, "user_id", 88L, "status", "PUBLISHED",
                "author_role", "ADMIN", "my_role", "ADMIN", "my_permissions", "CONTENT")));
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        assertThatThrownBy(() -> service.deletePost(7L, 41L))
                .isInstanceOf(com.pulse.common.exception.BizException.class)
                .hasMessageContaining("管理员不能删除其他管理员");
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void ownerCanDeleteAdminsPost() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(Map.of(
                "community_id", 9L, "user_id", 88L, "status", "PUBLISHED",
                "author_role", "ADMIN", "my_role", "OWNER")));
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        service.deletePost(7L, 41L);

        verify(jdbc).update(contains("status='DELETED'"), eq(41L));
    }

    @Test
    void regularMemberCannotDeleteSomeoneElsesPost() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("community_id", 9L, "user_id", 88L, "status", "PUBLISHED")))
                .thenReturn(List.of());
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        assertThatThrownBy(() -> service.deletePost(7L, 41L))
                .isInstanceOf(com.pulse.common.exception.BizException.class)
                .hasMessageContaining("无权删除");
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void pendingAndBlockedPostsIncrementCountOnlyWhenPublished() {
        JdbcTemplate pendingJdbc = mock(JdbcTemplate.class);
        when(pendingJdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("community_id", 9L, "status", "PENDING")))
                .thenReturn(List.of(Map.of("allowed", 1)));
        when(pendingJdbc.update(anyString(), any(Object[].class))).thenReturn(1);
        new CommunityService(pendingJdbc, mock(PasswordEncoder.class))
                .moderatePostByManager(7L, 41L, "PUBLISHED");
        verify(pendingJdbc).queryForList(contains("FOR UPDATE"), eq(7L), eq(41L));
        verify(pendingJdbc).update(contains("SET status=?"), eq("PUBLISHED"), eq(41L));
        verify(pendingJdbc).update(contains("post_count=post_count+1"), eq(9L));

        JdbcTemplate blockedJdbc = mock(JdbcTemplate.class);
        when(blockedJdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("community_id", 9L, "status", "BLOCKED")))
                .thenReturn(List.of(Map.of("allowed", 1)));
        when(blockedJdbc.update(anyString(), any(Object[].class))).thenReturn(1);
        new CommunityService(blockedJdbc, mock(PasswordEncoder.class))
                .moderatePostByManager(7L, 42L, "PUBLISHED");
        verify(blockedJdbc).update(contains("post_count=post_count+1"), eq(9L));
    }

    @Test
    void leavingPublishedStateDecrementsCountAndRepeatedStateIsIdempotent() {
        JdbcTemplate blockedJdbc = mock(JdbcTemplate.class);
        when(blockedJdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("community_id", 9L, "status", "PUBLISHED")))
                .thenReturn(List.of(Map.of("allowed", 1)));
        when(blockedJdbc.update(anyString(), any(Object[].class))).thenReturn(1);
        new CommunityService(blockedJdbc, mock(PasswordEncoder.class))
                .moderatePostByManager(7L, 41L, "BLOCKED");
        verify(blockedJdbc).update(contains("post_count=GREATEST(post_count-1,0)"), eq(9L));

        JdbcTemplate sameJdbc = mock(JdbcTemplate.class);
        when(sameJdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("community_id", 9L, "status", "PUBLISHED")))
                .thenReturn(List.of(Map.of("allowed", 1)));
        new CommunityService(sameJdbc, mock(PasswordEncoder.class))
                .moderatePostByManager(7L, 41L, "PUBLISHED");
        verify(sameJdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void deletedPostCannotBeRepublishedByManager() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("community_id", 9L, "status", "DELETED")))
                .thenReturn(List.of(Map.of("allowed", 1)));
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        assertThatThrownBy(() -> service.moderatePostByManager(7L, 41L, "PUBLISHED"))
                .isInstanceOf(com.pulse.common.exception.BizException.class)
                .hasMessageContaining("动态不存在");
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void favoritePostsAreScopedToActiveCommunityMemberships() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(Map.of("id", 41L)));
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        List<Map<String,Object>> result = service.favoritePosts(7L);

        assertThat(result).containsExactly(Map.of("id", 41L));
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).queryForList(sql.capture(), args.capture());
        assertThat(sql.getValue()).contains("community_name", "community_member", "m.status='ACTIVE'", "favorited_at");
        assertThat(args.getValue()).containsExactly(7L, 7L, 7L);
    }

    @Test
    void likeAndFavoriteRejectPostsThatAreNotPublished() {
        JdbcTemplate likeJdbc = mock(JdbcTemplate.class);
        when(likeJdbc.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());
        CommunityService likeService = new CommunityService(likeJdbc, mock(PasswordEncoder.class));

        assertThatThrownBy(() -> likeService.toggleLike(7L, 41L))
                .isInstanceOf(com.pulse.common.exception.BizException.class);
        verify(likeJdbc).queryForList(contains("status='PUBLISHED'"), eq(41L));

        JdbcTemplate favoriteJdbc = mock(JdbcTemplate.class);
        when(favoriteJdbc.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());
        CommunityService favoriteService = new CommunityService(favoriteJdbc, mock(PasswordEncoder.class));

        assertThatThrownBy(() -> favoriteService.toggleFavorite(7L, 41L))
                .isInstanceOf(com.pulse.common.exception.BizException.class);
        verify(favoriteJdbc).queryForList(contains("status='PUBLISHED'"), eq(41L));
    }

    @Test
    void activeMuteRejectsPublishingUsingDatabaseTimeComparison() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("post_mode", "ALL", "status", "APPROVED")))
                .thenReturn(List.of(Map.of("role", "MEMBER", "status", "MUTED", "muted_now", true)));
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        assertThatThrownBy(() -> service.publish(7L, 9L, Map.of("content", "测试动态")))
                .isInstanceOf(com.pulse.common.exception.BizException.class)
                .hasMessageContaining("已被禁言");

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc, times(2)).queryForList(sql.capture(), any(Object[].class));
        assertThat(sql.getAllValues().get(1)).contains("muted_until>NOW()", "muted_now");
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void expiredMuteIsRestoredBeforePublishing() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("post_mode", "ALL", "status", "APPROVED")))
                .thenReturn(List.of(Map.of("role", "MEMBER", "status", "MUTED", "muted_now", false)));
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(Object[].class))).thenReturn(55L);
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        Map<String,Object> result = service.publish(7L, 9L, Map.of("content", "解禁后的动态"));

        assertThat(result).containsEntry("id", 55L).containsEntry("status", "PUBLISHED");
        verify(jdbc).update(contains("SET status='ACTIVE',muted_until=NULL"), eq(9L), eq(7L));
        verify(jdbc).update(contains("post_count=post_count+1"), eq(9L));
    }

    @Test
    void reportStoresConfiguredReasonAndTypedEvidence() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(Map.of("code", "FRAUD")));
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        service.report(7L, "post", 41L, "fraud", "  转账截图  ",
                List.of("/files/a.jpg", "/files/b.mp4"), List.of("image", "video"));

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).update(sql.capture(), args.capture());
        assertThat(sql.getValue()).contains("evidence_urls", "evidence_types");
        assertThat(args.getValue()).containsExactly(7L, "POST", 41L, "FRAUD", "转账截图",
                "[\"/files/a.jpg\",\"/files/b.mp4\"]", "[\"image\",\"video\"]");
    }

    @Test
    void disabledOrUnknownReportReasonIsRejected() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        assertThatThrownBy(() -> service.report(7L, "POST", 41L, "DISABLED", null, null, null))
                .isInstanceOf(com.pulse.common.exception.BizException.class)
                .hasMessageContaining("有效的举报理由");
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void commentLikeCreatesLocatedNotificationAndReturnsCount() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("id", 51L, "user_id", 88L, "post_id", 41L, "community_id", 9L)))
                .thenReturn(List.of(Map.of("member", 1)))
                .thenReturn(List.of());
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);
        when(jdbc.queryForObject(contains("COUNT(*)"), eq(Long.class), eq(51L))).thenReturn(1L);
        when(jdbc.queryForObject(contains("COALESCE(NULLIF(nickname"), eq(String.class), eq(7L))).thenReturn("小明");
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        Map<String,Object> result = service.toggleCommentLike(7L, 51L);

        assertThat(result).containsEntry("liked", true).containsEntry("likeCount", 1L);
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc, times(2)).update(sql.capture(), args.capture());
        assertThat(sql.getAllValues().get(1)).contains("community_notification", "post_id", "comment_id", "actor_id");
        assertThat(args.getAllValues().get(1)).containsExactly(88L, 9L, 41L, 51L, 7L,
                "COMMENT_LIKE", "小明赞了你的评论", "你的评论收到一个赞");
    }

    @Test
    void likingOwnCommentDoesNotCreateANotification() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("id", 51L, "user_id", 7L, "post_id", 41L, "community_id", 9L)))
                .thenReturn(List.of(Map.of("member", 1)))
                .thenReturn(List.of());
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);
        when(jdbc.queryForObject(contains("COUNT(*)"), eq(Long.class), eq(51L))).thenReturn(1L);
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        service.toggleCommentLike(7L, 51L);

        verify(jdbc, times(1)).update(anyString(), any(Object[].class));
        verify(jdbc, never()).update(contains("community_notification"), any(Object[].class));
    }

    @Test
    void replyingToACommentNotifiesReplyTargetAndPostOwnerWithLocation() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("id", 41L, "community_id", 9L, "user_id", 99L)))
                .thenReturn(List.of(Map.of("member", 1)))
                .thenReturn(List.of(Map.of("id", 51L, "user_id", 88L)));
        when(jdbc.queryForObject(contains("INSERT INTO community_post_comment"), eq(Long.class),
                eq(41L), eq(7L), eq(51L), eq("回复内容"))).thenReturn(52L);
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);
        when(jdbc.queryForMap(anyString(), eq(52L))).thenReturn(Map.of("id", 52L));
        when(jdbc.queryForObject(contains("COALESCE(NULLIF(nickname"), eq(String.class), eq(7L))).thenReturn("小明");
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        service.comment(7L, 41L, "回复内容", 51L);

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc, times(3)).update(sql.capture(), args.capture());
        assertThat(args.getAllValues().get(1)).containsExactly(88L, 9L, 41L, 52L, 7L,
                "REPLY", "小明回复了你的评论", "回复内容");
        assertThat(args.getAllValues().get(2)).containsExactly(99L, 9L, 41L, 52L, 7L,
                "COMMENT", "小明评论了你的圈子动态", "回复内容");
    }

    @Test
    void longCommentNotificationIsTruncatedByUnicodeCodePointWithoutRollback() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        String longComment = "中".repeat(499) + "😀" + "后".repeat(499);
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("id", 41L, "community_id", 9L, "user_id", 88L)))
                .thenReturn(List.of(Map.of("member", 1)));
        when(jdbc.queryForObject(contains("INSERT INTO community_post_comment"), eq(Long.class), any(Object[].class))).thenReturn(52L);
        when(jdbc.queryForObject(contains("COALESCE(NULLIF(nickname"), eq(String.class), eq(7L))).thenReturn("小明");
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);
        when(jdbc.queryForMap(anyString(), eq(52L))).thenReturn(Map.of("id", 52L));
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        Map<String,Object> result = service.comment(7L, 41L, longComment, null);

        assertThat(result).containsEntry("id", 52L);
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc, times(2)).update(sql.capture(), args.capture());
        assertThat(sql.getAllValues().get(1)).contains("community_notification");
        String notificationContent = String.valueOf(args.getAllValues().get(1)[7]);
        assertThat(notificationContent.codePointCount(0, notificationContent.length())).isEqualTo(500);
        assertThat(notificationContent).endsWith("😀");
    }

    @Test
    void makingMemberAnAdminCreatesChineseNotification() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("owner", 1)))
                .thenReturn(List.of(Map.of("user_id", 88L, "role", "MEMBER", "community_name", "摄影圈")));
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);
        when(jdbc.queryForObject(contains("COALESCE(NULLIF(nickname"), eq(String.class), eq(7L))).thenReturn("圈主张三");
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        service.setAdmin(7L, 9L, 12L, true);

        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc, times(2)).update(anyString(), args.capture());
        assertThat(args.getAllValues().get(1)).containsExactly(88L, 9L, null, null, 7L,
                "ADMIN_SET", "圈主张三将你设为圈子管理员", "你已被设为圈子“摄影圈”的管理员");
    }

    @Test
    void nonOwnerCannotUpdateCommunityAnnouncement() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        assertThatThrownBy(() -> service.updateCommunity(7L, 9L, Map.of(
                "name", "摄影圈", "description", "介绍", "rules", "规则",
                "announcement", "新公告", "postMode", "ALL")))
                .isInstanceOf(com.pulse.common.exception.BizException.class)
                .hasMessageContaining("仅圈主");
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void communityAnnouncementCannotExceedTwoThousandCharacters() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(Map.of("owner", 1)));
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        assertThatThrownBy(() -> service.updateCommunity(7L, 9L, Map.of(
                "name", "摄影圈", "description", "介绍", "rules", "规则",
                "announcement", "公".repeat(2001), "postMode", "ALL")))
                .isInstanceOf(com.pulse.common.exception.BizException.class)
                .hasMessageContaining("公告不能超过2000字");
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void ownerCanPersistSettingsAndSubmitProfileChangesForReview() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("owner", 1)))
                .thenReturn(List.of(Map.of("name", "摄影圈", "avatar", "/old.png")))
                .thenReturn(List.of());
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);
        CommunityService service = new CommunityService(jdbc, mock(PasswordEncoder.class));

        service.updateCommunity(7L, 9L, Map.of(
                "name", "摄影圈", "avatar", "/avatar.png", "description", "介绍", "rules", "规则",
                "announcement", "周六外拍集合", "postMode", "ALL"));

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc, times(2)).update(sql.capture(), args.capture());
        assertThat(sql.getAllValues().get(0)).contains("announcement=COALESCE(?,announcement)").doesNotContain("name=?", "avatar=?");
        assertThat(args.getAllValues().get(0)).containsExactly("介绍", "规则", "周六外拍集合", "ALL", false, false, 9L);
        assertThat(sql.getAllValues().get(1)).contains("community_profile_review");
        assertThat(args.getAllValues().get(1)).containsExactly(9L, 7L, "摄影圈", "/avatar.png", false, true);
    }
}
