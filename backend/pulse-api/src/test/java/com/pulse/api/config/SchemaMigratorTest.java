package com.pulse.api.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SchemaMigratorTest {
    @Test
    void addsCommunityPostMediaColumnsWhenVersion68IsInstalled() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Integer.class))).thenReturn(68);

        SchemaMigrator migrator = new SchemaMigrator(jdbc);
        migrator.run(new DefaultApplicationArguments(new String[0]));

        verify(jdbc).execute(contains("ADD COLUMN IF NOT EXISTS original_images"));
        verify(jdbc).execute(contains("ALTER TABLE community_post ADD COLUMN IF NOT EXISTS media_types"));
        verify(jdbc).execute(contains("ADD COLUMN IF NOT EXISTS location_name"));
        verify(jdbc).execute(contains("ADD COLUMN IF NOT EXISTS location_address"));
        verify(jdbc).execute(contains("ADD COLUMN IF NOT EXISTS latitude"));
        verify(jdbc).execute(contains("ADD COLUMN IF NOT EXISTS longitude"));
        verify(jdbc).update(contains("VALUES (69)"));
    }

    @Test
    void addsReportReasonEvidenceAndNotificationLocationSchemaFromVersion69() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Integer.class))).thenReturn(69);

        SchemaMigrator migrator = new SchemaMigrator(jdbc);
        migrator.run(new DefaultApplicationArguments(new String[0]));

        verify(jdbc).execute(contains("ADD COLUMN IF NOT EXISTS announcement"));
        verify(jdbc).execute(contains("ADD COLUMN IF NOT EXISTS evidence_urls"));
        verify(jdbc).execute(contains("CREATE TABLE IF NOT EXISTS community_report_reason"));
        verify(jdbc).execute(contains("ADD COLUMN IF NOT EXISTS post_id"));
        verify(jdbc).execute(contains("ADD COLUMN IF NOT EXISTS comment_id"));
        verify(jdbc).execute(contains("ADD COLUMN IF NOT EXISTS actor_id"));
        verify(jdbc).execute(contains("CREATE TABLE IF NOT EXISTS community_post_comment_like"));
        verify(jdbc).update(contains("VALUES (70)"));
    }

    @Test
    void skipsLegacyMigrationWhenCurrentVersionIsInstalled() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Integer.class))).thenReturn(73);

        SchemaMigrator migrator = new SchemaMigrator(jdbc);
        migrator.run(new DefaultApplicationArguments(new String[0]));

        verify(jdbc, never()).update(contains("VALUES (70)"));
    }

    @Test
    void addsMemberRemovalReasonSchemaWhenVersion72IsInstalled() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Integer.class))).thenReturn(72);

        SchemaMigrator migrator = new SchemaMigrator(jdbc);
        migrator.run(new DefaultApplicationArguments(new String[0]));

        verify(jdbc).execute(contains("CREATE TABLE IF NOT EXISTS community_member_removal_reason"));
        verify(jdbc).execute(contains("idx_community_member_removal_reason_enabled"));
        verify(jdbc).update(contains("VALUES (73)"));
    }

    @Test
    void repairsCommunityPostPinningColumnsWhenVersion71IsInstalled() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Integer.class))).thenReturn(71);

        SchemaMigrator migrator = new SchemaMigrator(jdbc);
        migrator.run(new DefaultApplicationArguments(new String[0]));

        verify(jdbc).execute(contains("ADD COLUMN IF NOT EXISTS pinned BOOLEAN"));
        verify(jdbc).execute(contains("ADD COLUMN IF NOT EXISTS pinned_at"));
        verify(jdbc).execute(contains("ADD COLUMN IF NOT EXISTS pinned_by"));
        verify(jdbc).execute(contains("idx_community_post_pinned_feed"));
        verify(jdbc).update(contains("VALUES (72)"));
    }

    @Test
    void addsMomentCommentFileReferenceWhenVersion91IsInstalled() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Integer.class))).thenReturn(91);

        SchemaMigrator migrator = new SchemaMigrator(jdbc);
        migrator.run(new DefaultApplicationArguments(new String[0]));

        verify(jdbc).execute(contains("ALTER TABLE moment_comment ADD COLUMN IF NOT EXISTS image_file_id"));
        verify(jdbc).execute(contains("idx_moment_comment_image_file_id"));
        verify(jdbc).update(contains("VALUES (92)"));
    }

    @Test
    void createsContainerConfigWhenVersion93IsInstalled() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Integer.class))).thenReturn(93);

        SchemaMigrator migrator = new SchemaMigrator(jdbc);
        migrator.run(new DefaultApplicationArguments(new String[0]));

        verify(jdbc).execute(contains("CREATE TABLE IF NOT EXISTS sys_container_config"));
        verify(jdbc).update(contains("VALUES (94)"));
    }

    @Test
    void addsLegacyDataMigrationChoiceWhenVersion94IsInstalled() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Integer.class))).thenReturn(94);

        SchemaMigrator migrator = new SchemaMigrator(jdbc);
        migrator.run(new DefaultApplicationArguments(new String[0]));

        verify(jdbc).execute(contains("ADD COLUMN IF NOT EXISTS migrate_legacy_data"));
        verify(jdbc).update(contains("VALUES (95)"));
    }
}
