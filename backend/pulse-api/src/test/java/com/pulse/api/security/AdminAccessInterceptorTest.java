package com.pulse.api.security;

import com.pulse.api.support.AdminPermissionCodes;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class AdminAccessInterceptorTest {
    @ParameterizedTest(name = "{0} -> {1}")
    @MethodSource("communityRoutes")
    void communityRoutesUseTheirOwnPermission(String path, String expectedPermission) {
        assertThat(AdminAccessInterceptor.resolvePermission(path)).isEqualTo(expectedPermission);
    }

    private static Stream<Arguments> communityRoutes() {
        return Stream.of(
                Arguments.of("/api/admin/communities/content", AdminPermissionCodes.COMMUNITY_CONTENT),
                Arguments.of("/api/admin/communities/content/42", AdminPermissionCodes.COMMUNITY_CONTENT),
                Arguments.of("/api/admin/communities/reports", AdminPermissionCodes.COMMUNITY_REPORTS),
                Arguments.of("/api/admin/communities/reports/42", AdminPermissionCodes.COMMUNITY_REPORTS),
                Arguments.of("/api/admin/communities/report-reasons", AdminPermissionCodes.COMMUNITY_REPORTS),
                Arguments.of("/api/admin/communities/report-reasons/7", AdminPermissionCodes.COMMUNITY_REPORTS),
                Arguments.of("/api/admin/communities/member-removal-reasons", AdminPermissionCodes.COMMUNITIES),
                Arguments.of("/api/admin/communities/member-removal-reasons/7", AdminPermissionCodes.COMMUNITIES),
                Arguments.of("/api/admin/communities/topics", AdminPermissionCodes.COMMUNITY_TOPICS),
                Arguments.of("/api/admin/communities/topics/3", AdminPermissionCodes.COMMUNITY_TOPICS),
                Arguments.of("/api/admin/communities", AdminPermissionCodes.COMMUNITIES),
                Arguments.of("/api/admin/communities/9", AdminPermissionCodes.COMMUNITIES),
                Arguments.of("/api/admin/communities/9/status", AdminPermissionCodes.COMMUNITIES),
                Arguments.of("/api/admin/communities/profile-reviews", AdminPermissionCodes.COMMUNITIES),
                Arguments.of("/api/admin/communities/profile-reviews/12", AdminPermissionCodes.COMMUNITIES),
                Arguments.of("/api/admin/communities/audit-logs", AdminPermissionCodes.COMMUNITIES),
                Arguments.of("/api/admin/communities/config", AdminPermissionCodes.COMMUNITIES),
                Arguments.of("/api/admin/communities/stats", AdminPermissionCodes.COMMUNITIES),
                Arguments.of("/api/admin/communities/orders", AdminPermissionCodes.COMMUNITIES),
                Arguments.of("/api/admin/communities/incomes", AdminPermissionCodes.COMMUNITIES),
                Arguments.of("/api/admin/circle/dashboard/overview", AdminPermissionCodes.COMMUNITIES),
                Arguments.of("/api/admin/circle/dashboard/trend", AdminPermissionCodes.COMMUNITIES),
                Arguments.of("/api/admin/circle/dashboard/ranking", AdminPermissionCodes.COMMUNITIES),
                Arguments.of("/api/admin/circle/dashboard/income", AdminPermissionCodes.COMMUNITIES),
                Arguments.of("/api/admin/circle/dashboard/content", AdminPermissionCodes.COMMUNITIES)
        );
    }

    @Test
    void parentPermissionDoesNotCatchAnUnknownCommunitySubmodule() {
        assertThat(AdminAccessInterceptor.resolvePermission("/api/admin/communities/future-module")).isNull();
    }

    @Test
    void permissionCatalogIncludesTheTopicsPermission() {
        assertThat(AdminPermissionCodes.all()).contains(AdminPermissionCodes.COMMUNITY_TOPICS);
        assertThat(AdminPermissionCodes.parse(AdminPermissionCodes.COMMUNITY_TOPICS))
                .containsExactly(AdminPermissionCodes.COMMUNITY_TOPICS);
    }

    @Test
    void containerConfigRoutesUseTheContainerConfigPermission() {
        assertThat(AdminAccessInterceptor.resolvePermission("/api/admin/container-config"))
                .isEqualTo(AdminPermissionCodes.CONTAINER_CONFIG);
        assertThat(AdminAccessInterceptor.resolvePermission("/api/admin/container-config/prepare"))
                .isEqualTo(AdminPermissionCodes.CONTAINER_CONFIG);
        assertThat(AdminPermissionCodes.all()).contains(AdminPermissionCodes.CONTAINER_CONFIG);
    }
}
