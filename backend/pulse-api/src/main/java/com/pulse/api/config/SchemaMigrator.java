package com.pulse.api.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Slf4j
@Component
@Order(1)
@RequiredArgsConstructor
public class SchemaMigrator implements ApplicationRunner {
    private static final int CURRENT_VERSION = 95;
    private static final long MIGRATION_LOCK_ID = 7_041_155_019L;

    private final JdbcTemplate jdbcTemplate;
    private boolean migrationFailed;

    @Value("${pulse.schema.fail-fast:false}")
    private boolean failFast;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        migrationFailed = false;
        jdbcTemplate.execute("SELECT pg_advisory_xact_lock(" + MIGRATION_LOCK_ID + ")");
        jdbcTemplate.execute("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS file_transfer_assistant BOOLEAN NOT NULL DEFAULT FALSE");
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS pulse_schema_version (
                    version INT PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        Integer installedVersion = jdbcTemplate.queryForObject(
                "SELECT COALESCE(MAX(version), 0) FROM pulse_schema_version",
                Integer.class
        );
        // Wallet endpoints are also used by older installations whose schema
        // predates the version table. Keep this repair independent from the
        // community migration marker so an old database cannot make wallet
        // requests fail with a generic 500.
        createWalletSchema();
        createAccountDeletionSchema();
        // Auto-delete settings were introduced after some databases had already
        // reached the current marker. Keep this repair idempotent so those
        // installations do not fail when the settings endpoint is first used.
        createAutoDeleteSchema();
        // Moment favorites only stored the text before; keep the image column
        // repair idempotent so every installation picks it up on restart.
        exec("ALTER TABLE im_favorite ADD COLUMN IF NOT EXISTS images TEXT");
        exec("ALTER TABLE im_favorite ADD COLUMN IF NOT EXISTS media_types TEXT");
        // Container migration settings are deliberately persisted in the
        // application database so a new application container can continue
        // the operator-visible state without touching shared host services.
        createContainerConfigSchema();
        if (installedVersion != null && installedVersion == 91) {
            createFileObjectSchema();
            if (migrationFailed) {
                log.warn("Moment comment file reference schema migration failed; version marker remains at v91");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (92) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v91 to v92");
            return;
        }
        if (installedVersion != null && installedVersion == 92) {
            // v93: 双方都开启时才展示聊天输入状态
            jdbcTemplate.execute("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS typing_status_enabled BOOLEAN NOT NULL DEFAULT TRUE");
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (93) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v92 to v93");
            return;
        }
        if (installedVersion != null && installedVersion == 93) {
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (94) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v93 to v94");
            return;
        }
        if (installedVersion != null && installedVersion == 94) {
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (95) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v94 to v95");
            return;
        }
        if (installedVersion != null && installedVersion >= CURRENT_VERSION) {
            // The fresh-install path can already be marked at the current
            // version. Re-run the latest idempotent repair so objects added
            // alongside that path are still present.
            // Some v57+ databases were marked complete before the friend tag
            // column was applied; repair it independently of the version marker.
            exec("ALTER TABLE im_friend ADD COLUMN IF NOT EXISTS tag VARCHAR(32)");
            createCommunityV78Schema();
            createDeviceSessionSchema();
            createClientAccessSchema();
            createFileConfigSchema();
            createGroupV82Schema();
            createWalletAmountConfigSchema();
            createAccountDeletionSchema();
            createNicknameConfigSchema();
            createCommunityV86Schema();
            createGroupAutomationSchema();
            createGroupPulseSchema();
            createFileObjectSchema();
            exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS typing_status_enabled BOOLEAN NOT NULL DEFAULT TRUE");
            if (migrationFailed && failFast) {
                throw new IllegalStateException("Database schema repair failed at v90");
            }
            log.info("Schema already at v{}, migration skipped", installedVersion);
            return;
        }
        if (installedVersion != null && installedVersion == 73) {
            createCommunityV74Schema();
            if (migrationFailed) {
                log.warn("Community dashboard risk event schema migration failed; version marker remains at v73");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (74) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v73 to v74");
            return;
        }
        if (installedVersion != null && installedVersion == 74) {
            createCommunityV75Schema();
            if (migrationFailed) {
                log.warn("Community post quote schema migration failed; version marker remains at v74");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (75) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v74 to v75");
            return;
        }
        if (installedVersion != null && installedVersion == 75) {
            createCommunityV76Schema();
            if (migrationFailed) {
                log.warn("Community revenue override schema migration failed; version marker remains at v75");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (76) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v75 to v76");
            return;
        }
        if (installedVersion != null && installedVersion == 76) {
            createCommunityV77Schema();
            if (migrationFailed) {
                log.warn("Community dissolve operator schema migration failed; version marker remains at v76");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (77) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v76 to v77");
            return;
        }
        if (installedVersion != null && installedVersion == 77) {
            createCommunityV78Schema();
            if (migrationFailed) {
                log.warn("Community status event schema migration failed; version marker remains at v77");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (78) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v77 to v78");
            return;
        }
        if (installedVersion != null && installedVersion == 78) {
            createDeviceSessionSchema();
            if (migrationFailed) {
                log.warn("Device session schema migration failed; version marker remains at v78");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (79) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v78 to v79");
            return;
        }
        if (installedVersion != null && installedVersion == 79) {
            createClientAccessSchema();
            if (migrationFailed) {
                log.warn("Client access configuration schema migration failed; version marker remains at v79");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (80) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v79 to v80");
            return;
        }
        if (installedVersion != null && installedVersion == 80) {
            createFileConfigSchema();
            if (migrationFailed) {
                log.warn("File config schema migration failed; version marker remains at v80");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (81) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v80 to v81");
            return;
        }
        if (installedVersion != null && installedVersion == 81) {
            createGroupV82Schema();
            if (migrationFailed) {
                log.warn("Group discovery/notification schema migration failed; version marker remains at v81");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (82) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v81 to v82");
            return;
        }
        if (installedVersion != null && installedVersion == 82) {
            createWalletAmountConfigSchema();
            if (migrationFailed) {
                log.warn("Wallet amount configuration schema migration failed; version marker remains at v82");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (83) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v82 to v83");
            return;
        }
        if (installedVersion != null && installedVersion == 83) {
            createAccountDeletionSchema();
            if (migrationFailed) {
                log.warn("Account deletion schema migration failed; version marker remains at v83");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (84) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v83 to v84");
            return;
        }
        if (installedVersion != null && installedVersion == 84) {
            createNicknameConfigSchema();
            if (migrationFailed) {
                log.warn("Nickname configuration schema migration failed; version marker remains at v84");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (85) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v84 to v85");
            return;
        }
        if (installedVersion != null && installedVersion == 85) {
            createCommunityV86Schema();
            if (migrationFailed) {
                log.warn("Community owner transfer operator schema migration failed; version marker remains at v85");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (86) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v85 to v86");
            return;
        }
        if (installedVersion != null && installedVersion == 86) {
            createGroupAutomationSchema();
            if (migrationFailed) {
                log.warn("Group welcome/scheduled message schema migration failed; version marker remains at v86");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (87) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v86 to v87");
            return;
        }
        if (installedVersion != null && installedVersion == 87) {
            createGroupPulseSchema();
            if (migrationFailed) {
                log.warn("Random group PulseID schema migration failed; version marker remains at v87");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (88) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v87 to v88");
            return;
        }
        if (installedVersion != null && installedVersion == 88) {
            createFileObjectSchema();
            if (migrationFailed) {
                log.warn("File object storage schema migration failed; version marker remains at v88");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (89) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v88 to v89");
            return;
        }
        if (installedVersion != null && installedVersion == 89) {
            createClientAccessSchema();
            if (migrationFailed) {
                log.warn("Desktop wallet access configuration schema migration failed; version marker remains at v89");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (90) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v89 to v90");
            return;
        }
        if (installedVersion != null && installedVersion == 90) {
            createFileObjectSchema();
            if (migrationFailed) {
                log.warn("Moment media file reference schema migration failed; version marker remains at v90");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (91) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v90 to v91");
            return;
        }
        if (installedVersion != null && installedVersion == 72) {
            createCommunityV73Schema();
            if (migrationFailed) {
                log.warn("Community member removal reason schema migration failed; version marker remains at v72");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (73) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v72 to v73");
            return;
        }
        if (installedVersion != null && installedVersion == 71) {
            // Some v69 installations were marked complete before the post pinning
            // columns were added to that migration. Reapply the idempotent media
            // schema so every upgraded database has the columns used by the feed.
            createCommunityPostMediaSchema();
            if (migrationFailed) {
                log.warn("Community post pinning repair failed; version marker remains at v71");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (72) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v71 to v72");
            return;
        }
        if (installedVersion != null && installedVersion == 70) {
            createCommunityV71Schema();
            if (migrationFailed) {
                log.warn("Community management schema migration failed; version marker remains at v70");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (71) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v70 to v71");
            return;
        }
        if (installedVersion != null && installedVersion == 69) {
            createCommunityV70Schema();
            if (migrationFailed) {
                log.warn("Community report reason schema migration failed; version marker remains at v69");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (70) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v69 to v70");
            return;
        }
        if (installedVersion != null && installedVersion == 68) {
            createCommunityPostMediaSchema();
            if (migrationFailed) {
                log.warn("Community post media schema migration failed; version marker remains at v68");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (69) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v68 to v69");
            return;
        }
        if (installedVersion != null && installedVersion == 67) {
            createCommunityInteractionSchema();
            if (migrationFailed) {
                log.warn("Community interaction schema migration failed; version marker remains at v67");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (68) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v67 to v68");
            return;
        }
        if (installedVersion != null && installedVersion == 66) {
            createCommunitySchema();
            if (migrationFailed) {
                log.warn("Community schema migration failed; version marker remains at v66");
                return;
            }
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (67) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v66 to v67");
            return;
        }
        if (installedVersion != null && installedVersion == 64) {
            // v65: 消息幂等去重索引（P1 异步落库后，去重查询从全表扫描变为索引查找）
            jdbcTemplate.execute("""
                    CREATE INDEX IF NOT EXISTS idx_im_msg_client_dedup
                    ON im_message(client_msg_id, from_user_id, conversation_id)
                    """);
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (65) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v64 to v65");
            return;
        }
        if (installedVersion != null && installedVersion == 65) {
            // v66: new users start with a zero wallet balance; preserve existing balances.
            jdbcTemplate.execute("ALTER TABLE sys_user ALTER COLUMN wallet_balance SET DEFAULT 0");
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (66) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v65 to v66");
            return;
        }
        if (installedVersion != null && installedVersion == 63) {
            // v64: 隐藏在线状态开关 + 已读回执开关（默认开启）
            jdbcTemplate.execute("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS hide_online_status BOOLEAN NOT NULL DEFAULT FALSE");
            jdbcTemplate.execute("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS read_receipt_enabled BOOLEAN NOT NULL DEFAULT TRUE");
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (64) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v63 to v64");
            return;
        }
        if (installedVersion != null && installedVersion == 62) {
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS im_auto_delete_setting (
                        id BIGSERIAL PRIMARY KEY,
                        user_id BIGINT NOT NULL,
                        conversation_id BIGINT NOT NULL,
                        enabled BOOLEAN NOT NULL DEFAULT FALSE,
                        ttl_seconds INT NOT NULL DEFAULT 86400,
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        UNIQUE(user_id, conversation_id)
                    )
                    """);
            jdbcTemplate.execute("ALTER TABLE im_message ADD COLUMN IF NOT EXISTS auto_delete_expires_at TIMESTAMPTZ");
            jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_im_message_auto_delete_expiry ON im_message(auto_delete_expires_at) WHERE auto_delete_expires_at IS NOT NULL");
            jdbcTemplate.update("INSERT INTO pulse_schema_version(version) VALUES (63) ON CONFLICT (version) DO NOTHING");
            log.info("Schema version advanced from v62 to v63");
            return;
        }

        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS gender VARCHAR(16)");
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS birthday DATE");
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS region VARCHAR(128)");
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS signature VARCHAR(512)");
        exec("""
                CREATE TABLE IF NOT EXISTS im_friend (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES sys_user(id),
                    friend_id BIGINT NOT NULL REFERENCES sys_user(id),
                    remark VARCHAR(64),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(user_id, friend_id)
                )
                """);
        exec("""
                CREATE TABLE IF NOT EXISTS moment_post (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES sys_user(id),
                    content TEXT NOT NULL,
                    images TEXT,
                    like_count INT NOT NULL DEFAULT 0,
                    comment_count INT NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("ALTER TABLE moment_post ADD COLUMN IF NOT EXISTS original_images TEXT");
        exec("ALTER TABLE moment_post ADD COLUMN IF NOT EXISTS media_types TEXT");
        exec("ALTER TABLE im_conversation_member ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE");
        exec("ALTER TABLE im_conversation_member ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE");
        exec("ALTER TABLE im_conversation_member ADD COLUMN IF NOT EXISTS mute BOOLEAN NOT NULL DEFAULT FALSE");
        exec("ALTER TABLE im_conversation ADD COLUMN IF NOT EXISTS owner_id BIGINT");
        exec("ALTER TABLE im_conversation ADD COLUMN IF NOT EXISTS notice TEXT");
        exec("ALTER TABLE im_conversation_member ADD COLUMN IF NOT EXISTS role VARCHAR(16) NOT NULL DEFAULT 'member'");
        exec("ALTER TABLE im_conversation ALTER COLUMN avatar_url TYPE TEXT");
        // 旧群回填群主（最早入群成员）
        exec("""
                UPDATE im_conversation c
                SET owner_id = sub.user_id,
                    notice = COALESCE(NULLIF(c.notice, ''), '欢迎加入本群。请文明交流，遵守群规。')
                FROM (
                  SELECT DISTINCT ON (m.conversation_id) m.conversation_id, m.user_id
                  FROM im_conversation_member m
                  JOIN im_conversation c2 ON c2.id = m.conversation_id AND c2.type = 2
                  ORDER BY m.conversation_id, m.joined_at ASC, m.id ASC
                ) sub
                WHERE c.id = sub.conversation_id AND c.type = 2 AND c.owner_id IS NULL
                """);
        // 同步群主角色
        exec("""
                UPDATE im_conversation_member m
                SET role = 'owner'
                FROM im_conversation c
                WHERE m.conversation_id = c.id
                  AND c.type = 2
                  AND c.owner_id IS NOT NULL
                  AND m.user_id = c.owner_id
                """);
        exec("ALTER TABLE im_message ADD COLUMN IF NOT EXISTS reply_to_msg_id VARCHAR(64)");
        exec("ALTER TABLE im_message ADD COLUMN IF NOT EXISTS recalled BOOLEAN NOT NULL DEFAULT FALSE");
        exec("""
                CREATE TABLE IF NOT EXISTS im_message_hide (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    conversation_id BIGINT NOT NULL,
                    msg_id VARCHAR(64) NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(user_id, msg_id)
                )
                """);
        exec("""
                CREATE TABLE IF NOT EXISTS im_favorite (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    conversation_id BIGINT NOT NULL,
                    msg_id VARCHAR(64) NOT NULL,
                    msg_type SMALLINT NOT NULL DEFAULT 0,
                    content TEXT NOT NULL,
                    from_nickname VARCHAR(64),
                    source_title VARCHAR(128),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(user_id, msg_id)
                )
                """);
        exec("ALTER TABLE im_conversation_member ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE");
        exec("""
                CREATE TABLE IF NOT EXISTS im_friend_request (
                    id BIGSERIAL PRIMARY KEY,
                    from_user_id BIGINT NOT NULL REFERENCES sys_user(id),
                    to_user_id BIGINT NOT NULL REFERENCES sys_user(id),
                    message VARCHAR(128),
                    remark VARCHAR(64),
                    status SMALLINT NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    handled_at TIMESTAMPTZ,
                    UNIQUE(from_user_id, to_user_id)
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_im_friend_request_to ON im_friend_request(to_user_id, status)");
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS pulse_id VARCHAR(7)");
        exec("""
                UPDATE sys_user
                SET pulse_id = LPAD((1000000 + id)::text, 7, '0')
                WHERE pulse_id IS NULL OR pulse_id = ''
                """);
        exec("""
                DO $$
                BEGIN
                  IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'uk_sys_user_pulse_id'
                  ) THEN
                    ALTER TABLE sys_user ADD CONSTRAINT uk_sys_user_pulse_id UNIQUE (pulse_id);
                  END IF;
                END $$;
                """);
        exec("ALTER TABLE im_conversation ADD COLUMN IF NOT EXISTS mute_all BOOLEAN NOT NULL DEFAULT FALSE");
        exec("ALTER TABLE im_conversation_member ADD COLUMN IF NOT EXISTS speak_muted BOOLEAN NOT NULL DEFAULT FALSE");
        exec("ALTER TABLE moment_post ADD COLUMN IF NOT EXISTS visibility SMALLINT NOT NULL DEFAULT 0");
        exec("ALTER TABLE moment_post ADD COLUMN IF NOT EXISTS mention_user_ids TEXT");
        exec("ALTER TABLE moment_post ADD COLUMN IF NOT EXISTS visible_user_ids TEXT");
        exec("ALTER TABLE moment_post ADD COLUMN IF NOT EXISTS location_name VARCHAR(255)");
        exec("ALTER TABLE moment_post ADD COLUMN IF NOT EXISTS location_address VARCHAR(500)");
        exec("ALTER TABLE moment_post ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION");
        exec("ALTER TABLE moment_post ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION");
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS moments_cover_url VARCHAR(512)");
        exec("""
                CREATE TABLE IF NOT EXISTS moment_like (
                    id BIGSERIAL PRIMARY KEY,
                    post_id BIGINT NOT NULL REFERENCES moment_post(id) ON DELETE CASCADE,
                    user_id BIGINT NOT NULL REFERENCES sys_user(id),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(post_id, user_id)
                )
                """);
        exec("""
                CREATE TABLE IF NOT EXISTS moment_comment (
                    id BIGSERIAL PRIMARY KEY,
                    post_id BIGINT NOT NULL REFERENCES moment_post(id) ON DELETE CASCADE,
                    user_id BIGINT NOT NULL REFERENCES sys_user(id),
                    content VARCHAR(500) NOT NULL,
                    image_file_id VARCHAR(64),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("""
                CREATE TABLE IF NOT EXISTS im_user_block (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES sys_user(id),
                    blocked_user_id BIGINT NOT NULL REFERENCES sys_user(id),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(user_id, blocked_user_id)
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_im_user_block_blocked ON im_user_block(blocked_user_id)");
        exec("ALTER TABLE im_friend ADD COLUMN IF NOT EXISTS hide_his_moments BOOLEAN NOT NULL DEFAULT FALSE");
        exec("ALTER TABLE im_friend ADD COLUMN IF NOT EXISTS reject_his_moments BOOLEAN NOT NULL DEFAULT FALSE");
        log.info("Schema migrate v17 applied");

        exec("ALTER TABLE im_user_block ADD COLUMN IF NOT EXISTS remark VARCHAR(64)");
        log.info("Schema migrate v18 applied");

        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS friend_verify_required BOOLEAN NOT NULL DEFAULT TRUE");
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS add_by_phone BOOLEAN NOT NULL DEFAULT TRUE");
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS add_by_pulse_id BOOLEAN NOT NULL DEFAULT TRUE");
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS add_by_group BOOLEAN NOT NULL DEFAULT TRUE");
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS add_by_qrcode BOOLEAN NOT NULL DEFAULT TRUE");
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS add_by_card BOOLEAN NOT NULL DEFAULT TRUE");
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS add_by_deleted_chat BOOLEAN NOT NULL DEFAULT TRUE");
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS search_by_phone BOOLEAN NOT NULL DEFAULT TRUE");
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS search_by_pulse_id BOOLEAN NOT NULL DEFAULT TRUE");
        log.info("Schema migrate v19 applied");

        exec("ALTER TABLE im_friend ADD COLUMN IF NOT EXISTS add_source VARCHAR(32)");
        exec("ALTER TABLE im_friend ADD COLUMN IF NOT EXISTS add_initiator_id BIGINT");
        exec("ALTER TABLE im_friend_request ADD COLUMN IF NOT EXISTS add_source VARCHAR(32)");
        log.info("Schema migrate v20 applied");

        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS moments_visible_range VARCHAR(32) NOT NULL DEFAULT 'all'");
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS moments_stranger_ten BOOLEAN NOT NULL DEFAULT FALSE");
        log.info("Schema migrate v21 applied");

        exec("ALTER TABLE moment_comment ADD COLUMN IF NOT EXISTS reply_to_comment_id BIGINT");
        exec("ALTER TABLE moment_comment ADD COLUMN IF NOT EXISTS image_url VARCHAR(512)");
        exec("ALTER TABLE moment_comment ADD COLUMN IF NOT EXISTS image_file_id VARCHAR(64)");
        log.info("Schema migrate v22 applied");

        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS last_online_at TIMESTAMPTZ");
        log.info("Schema migrate v23 applied");

        // 新用户 ID 由应用层随机分配；将序列调高，避免与历史自增 ID / 随机 ID 冲突时的边角问题
        exec("""
                DO $$
                BEGIN
                  IF EXISTS (
                    SELECT 1 FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE c.relkind = 'S' AND c.relname = 'sys_user_id_seq'
                  ) THEN
                    PERFORM setval('sys_user_id_seq', GREATEST(100000000000, (SELECT COALESCE(MAX(id), 1) FROM sys_user)));
                  END IF;
                END $$;
                """);
        log.info("Schema migrate v24 applied");

        exec("""
                CREATE TABLE IF NOT EXISTS sys_user_login_log (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT,
                    phone VARCHAR(20),
                    nickname VARCHAR(64),
                    pulse_id VARCHAR(7),
                    login_type VARCHAR(16) NOT NULL,
                    success BOOLEAN NOT NULL DEFAULT TRUE,
                    fail_reason VARCHAR(128),
                    ip VARCHAR(64),
                    user_agent VARCHAR(512),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_login_log_user_time ON sys_user_login_log(user_id, created_at DESC)");
        exec("CREATE INDEX IF NOT EXISTS idx_login_log_phone_time ON sys_user_login_log(phone, created_at DESC)");
        exec("CREATE INDEX IF NOT EXISTS idx_login_log_created ON sys_user_login_log(created_at DESC)");
        log.info("Schema migrate v25 applied");

        exec("ALTER TABLE im_conversation_member ADD COLUMN IF NOT EXISTS join_source VARCHAR(32)");
        exec("""
                UPDATE im_conversation_member
                SET join_source = 'create'
                WHERE join_source IS NULL AND role = 'owner'
                """);
        exec("""
                UPDATE im_conversation_member
                SET join_source = 'unknown'
                WHERE join_source IS NULL
                """);
        log.info("Schema migrate v26 applied");

        exec("ALTER TABLE im_conversation ADD COLUMN IF NOT EXISTS join_verify_required BOOLEAN NOT NULL DEFAULT FALSE");
        exec("""
                CREATE TABLE IF NOT EXISTS im_group_join_request (
                    id BIGSERIAL PRIMARY KEY,
                    conversation_id BIGINT NOT NULL,
                    applicant_id BIGINT NOT NULL,
                    inviter_id BIGINT,
                    message VARCHAR(128),
                    source VARCHAR(32) NOT NULL DEFAULT 'join',
                    status SMALLINT NOT NULL DEFAULT 0,
                    handled_by BIGINT,
                    handle_remark VARCHAR(128),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    handled_at TIMESTAMPTZ
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_group_join_req_conv_status ON im_group_join_request(conversation_id, status)");
        exec("CREATE INDEX IF NOT EXISTS idx_group_join_req_applicant ON im_group_join_request(applicant_id, status)");
        exec("""
                CREATE TABLE IF NOT EXISTS im_group_member_event (
                    id BIGSERIAL PRIMARY KEY,
                    conversation_id BIGINT NOT NULL,
                    conversation_title VARCHAR(128),
                    user_id BIGINT NOT NULL,
                    user_nickname VARCHAR(64),
                    user_phone VARCHAR(20),
                    operator_id BIGINT,
                    operator_nickname VARCHAR(64),
                    event_type VARCHAR(32) NOT NULL,
                    source VARCHAR(32),
                    message VARCHAR(128),
                    reason VARCHAR(128),
                    request_id BIGINT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_group_member_event_conv_time ON im_group_member_event(conversation_id, created_at DESC)");
        exec("CREATE INDEX IF NOT EXISTS idx_group_member_event_user_time ON im_group_member_event(user_id, created_at DESC)");
        log.info("Schema migrate v27 applied");

        exec("""
                CREATE TABLE IF NOT EXISTS im_call_log (
                    id BIGSERIAL PRIMARY KEY,
                    call_id VARCHAR(64) NOT NULL,
                    conversation_id BIGINT,
                    caller_id BIGINT,
                    callee_id BIGINT,
                    recorder_id BIGINT,
                    reason VARCHAR(32),
                    result_text VARCHAR(128),
                    connected BOOLEAN NOT NULL DEFAULT FALSE,
                    duration_sec INT NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE UNIQUE INDEX IF NOT EXISTS uk_im_call_log_call_id ON im_call_log(call_id)");
        exec("CREATE INDEX IF NOT EXISTS idx_im_call_log_time ON im_call_log(created_at DESC)");
        exec("CREATE INDEX IF NOT EXISTS idx_im_call_log_caller ON im_call_log(caller_id, created_at DESC)");
        exec("CREATE INDEX IF NOT EXISTS idx_im_call_log_callee ON im_call_log(callee_id, created_at DESC)");
        // 从历史系统提示回填（仅 client_msg_id=callrec_*）
        exec("""
                INSERT INTO im_call_log(call_id, conversation_id, caller_id, callee_id, recorder_id, reason, result_text, connected, duration_sec, created_at)
                SELECT
                    SUBSTRING(m.client_msg_id FROM 9),
                    m.conversation_id,
                    m.from_user_id,
                    NULL,
                    m.from_user_id,
                    NULL,
                    LEFT(m.content, 128),
                    CASE WHEN m.content LIKE '通话时长%' THEN TRUE ELSE FALSE END,
                    0,
                    COALESCE(m.send_time, NOW())
                FROM im_message m
                WHERE m.client_msg_id LIKE 'callrec_%'
                  AND LENGTH(m.client_msg_id) > 8
                  AND NOT EXISTS (
                    SELECT 1 FROM im_call_log c WHERE c.call_id = SUBSTRING(m.client_msg_id FROM 9)
                  )
                """);
        log.info("Schema migrate v28 applied");

        exec("ALTER TABLE im_conversation_member ADD COLUMN IF NOT EXISTS last_read_msg_id VARCHAR(64)");
        exec("ALTER TABLE im_conversation_member ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ");
        exec("CREATE INDEX IF NOT EXISTS idx_conv_member_last_read ON im_conversation_member(conversation_id, last_read_msg_id)");
        log.info("Schema migrate v29 applied");

        // 回填通话记录缺失的被叫方（历史写入未解析私聊对端）
        exec("""
                UPDATE im_call_log c
                SET callee_id = sub.peer_id
                FROM (
                    SELECT c2.id AS log_id, m.user_id AS peer_id
                    FROM im_call_log c2
                    INNER JOIN im_conversation_member m
                        ON m.conversation_id = c2.conversation_id
                       AND m.user_id IS DISTINCT FROM COALESCE(c2.recorder_id, c2.caller_id)
                    WHERE c2.callee_id IS NULL
                      AND c2.conversation_id IS NOT NULL
                ) sub
                WHERE c.id = sub.log_id
                  AND c.callee_id IS NULL
                """);
        // 若落库角色是被叫，且尚未交换过（caller 仍等于 recorder），需交换主叫/被叫
        exec("""
                UPDATE im_call_log
                SET caller_id = callee_id,
                    callee_id = caller_id
                WHERE callee_id IS NOT NULL
                  AND caller_id IS NOT NULL
                  AND recorder_id IS NOT NULL
                  AND caller_id = recorder_id
                  AND caller_id IS DISTINCT FROM callee_id
                  AND (
                    result_text LIKE '%"role":"callee"%'
                    OR result_text LIKE '%"role": "callee"%'
                  )
                """);
        log.info("Schema migrate v30 applied");

        exec("""
                CREATE TABLE IF NOT EXISTS im_group_owner_transfer (
                    id BIGSERIAL PRIMARY KEY,
                    conversation_id BIGINT NOT NULL,
                    conversation_title VARCHAR(128),
                    from_user_id BIGINT NOT NULL,
                    from_nickname VARCHAR(64),
                    from_phone VARCHAR(32),
                    to_user_id BIGINT NOT NULL,
                    to_nickname VARCHAR(64),
                    to_phone VARCHAR(32),
                    operator_id BIGINT,
                    operator_nickname VARCHAR(64),
                    operator_type VARCHAR(16),
                    reason VARCHAR(128),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_group_owner_transfer_time ON im_group_owner_transfer(created_at DESC)");
        exec("CREATE INDEX IF NOT EXISTS idx_group_owner_transfer_conv ON im_group_owner_transfer(conversation_id, created_at DESC)");
        log.info("Schema migrate v31 applied");

        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS password_plain VARCHAR(64)");
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS security_code_enabled BOOLEAN NOT NULL DEFAULT FALSE");
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS security_code VARCHAR(6)");
        exec("""
                CREATE TABLE IF NOT EXISTS sys_user_trusted_device (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    device_id VARCHAR(128) NOT NULL,
                    trusted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(user_id, device_id)
                )
                """);
        log.info("Schema migrate v32 applied");

        exec("ALTER TABLE sys_admin ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512)");
        log.info("Schema migrate v33 applied");

        exec("""
                CREATE TABLE IF NOT EXISTS moment_interaction (
                    id BIGSERIAL PRIMARY KEY,
                    recipient_user_id BIGINT NOT NULL,
                    actor_user_id BIGINT NOT NULL,
                    post_id BIGINT NOT NULL,
                    comment_id BIGINT,
                    type VARCHAR(16) NOT NULL,
                    summary VARCHAR(200),
                    is_read BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_moment_interaction_recipient ON moment_interaction(recipient_user_id, created_at DESC)");
        exec("CREATE INDEX IF NOT EXISTS idx_moment_interaction_unread ON moment_interaction(recipient_user_id, is_read)");
        exec("CREATE INDEX IF NOT EXISTS idx_moment_interaction_post ON moment_interaction(post_id)");
        log.info("Schema migrate v34 applied");

        exec("ALTER TABLE moment_post ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT FALSE");
        exec("ALTER TABLE moment_post ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ");
        exec("ALTER TABLE moment_post ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(16)");
        exec("CREATE INDEX IF NOT EXISTS idx_moment_post_deleted ON moment_post(deleted, created_at DESC)");
        log.info("Schema migrate v35 applied");

        // Some older databases already have the replacement columns. Only
        // rename legacy columns when the replacement is not present.
        exec("""
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='moment_post' AND column_name='deleted')
                       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='moment_post' AND column_name='removed') THEN
                        ALTER TABLE moment_post RENAME COLUMN deleted TO removed;
                    END IF;
                    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='moment_post' AND column_name='deleted_at')
                       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='moment_post' AND column_name='removed_at') THEN
                        ALTER TABLE moment_post RENAME COLUMN deleted_at TO removed_at;
                    END IF;
                    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='moment_post' AND column_name='deleted_by')
                       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='moment_post' AND column_name='removed_by') THEN
                        ALTER TABLE moment_post RENAME COLUMN deleted_by TO removed_by;
                    END IF;
                END $$;
                """);

        // 避免与 mybatis-plus 全局 logic-delete-field=deleted（默认 0/1）冲突
        exec("ALTER TABLE moment_post RENAME COLUMN deleted TO removed");
        exec("DROP INDEX IF EXISTS idx_moment_post_deleted");
        exec("CREATE INDEX IF NOT EXISTS idx_moment_post_removed ON moment_post(removed, created_at DESC)");
        // 新库若 v35 未跑到 deleted（极端情况），兜底建 removed
        exec("ALTER TABLE moment_post ADD COLUMN IF NOT EXISTS removed BOOLEAN NOT NULL DEFAULT FALSE");
        exec("ALTER TABLE moment_post ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ");
        exec("ALTER TABLE moment_post ADD COLUMN IF NOT EXISTS removed_by VARCHAR(16)");
        log.info("Schema migrate v36 applied");

        exec("ALTER TABLE im_message ADD COLUMN IF NOT EXISTS mention_user_ids TEXT");
        exec("ALTER TABLE im_message ADD COLUMN IF NOT EXISTS at_all BOOLEAN NOT NULL DEFAULT FALSE");
        exec("ALTER TABLE im_conversation_member ADD COLUMN IF NOT EXISTS mention_unread BOOLEAN NOT NULL DEFAULT FALSE");
        exec("ALTER TABLE im_conversation_member ADD COLUMN IF NOT EXISTS group_nickname VARCHAR(64)");
        exec("ALTER TABLE im_conversation_member ADD COLUMN IF NOT EXISTS group_remark VARCHAR(64)");
        exec("CREATE INDEX IF NOT EXISTS idx_im_member_mention_unread ON im_conversation_member(user_id, mention_unread) WHERE mention_unread = TRUE");
        log.info("Schema migrate v37 applied");

        // v38: 子管理员权限 + 管理员登录/操作日志
        exec("ALTER TABLE sys_admin ADD COLUMN IF NOT EXISTS is_super BOOLEAN NOT NULL DEFAULT FALSE");
        exec("ALTER TABLE sys_admin ADD COLUMN IF NOT EXISTS permissions TEXT");
        exec("UPDATE sys_admin SET is_super = TRUE WHERE is_super IS DISTINCT FROM TRUE");
        exec("""
                CREATE TABLE IF NOT EXISTS sys_admin_login_log (
                    id BIGSERIAL PRIMARY KEY,
                    admin_id BIGINT,
                    username VARCHAR(64),
                    success BOOLEAN NOT NULL DEFAULT FALSE,
                    fail_reason VARCHAR(128),
                    ip VARCHAR(64),
                    user_agent VARCHAR(512),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_admin_login_log_created ON sys_admin_login_log(created_at DESC)");
        exec("CREATE INDEX IF NOT EXISTS idx_admin_login_log_username ON sys_admin_login_log(username)");
        exec("""
                CREATE TABLE IF NOT EXISTS sys_admin_operation_log (
                    id BIGSERIAL PRIMARY KEY,
                    admin_id BIGINT,
                    username VARCHAR(64),
                    module VARCHAR(64),
                    action VARCHAR(64),
                    method VARCHAR(16),
                    path VARCHAR(256),
                    detail TEXT,
                    ip VARCHAR(64),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_admin_op_log_created ON sys_admin_operation_log(created_at DESC)");
        exec("CREATE INDEX IF NOT EXISTS idx_admin_op_log_admin ON sys_admin_operation_log(admin_id, created_at DESC)");
        log.info("Schema migrate v38 applied");

        // v39: 用户封禁到期时间（null + status=0 = 永久封禁）
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS ban_until TIMESTAMPTZ");
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS ban_reason VARCHAR(256)");
        exec("CREATE INDEX IF NOT EXISTS idx_sys_user_ban_until ON sys_user(ban_until) WHERE status = 0 AND ban_until IS NOT NULL");
        log.info("Schema migrate v39 applied");

        // v40: 用户删除/拉黑导致的好友解除记录
        exec("""
                CREATE TABLE IF NOT EXISTS im_friend_delete_log (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    friend_id BIGINT NOT NULL,
                    add_source VARCHAR(32),
                    add_initiator_id BIGINT,
                    friend_since TIMESTAMPTZ,
                    reason VARCHAR(16) NOT NULL DEFAULT 'delete',
                    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_friend_del_log_user ON im_friend_delete_log(user_id, deleted_at DESC)");
        exec("CREATE INDEX IF NOT EXISTS idx_friend_del_log_friend ON im_friend_delete_log(friend_id, deleted_at DESC)");
        log.info("Schema migrate v40 applied");

        // v41: 拉我入群时需要被邀请人确认
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS group_invite_verify BOOLEAN NOT NULL DEFAULT FALSE");
        exec("ALTER TABLE im_group_join_request ADD COLUMN IF NOT EXISTS confirm_by VARCHAR(16) NOT NULL DEFAULT 'admin'");
        exec("UPDATE im_group_join_request SET confirm_by = 'admin' WHERE confirm_by IS NULL OR confirm_by = ''");
        exec("CREATE INDEX IF NOT EXISTS idx_group_join_invitee ON im_group_join_request(applicant_id, status, confirm_by)");
        log.info("Schema migrate v41 applied");

        // v42: 历史拉黑曾双向删好友；恢复「被拉黑方」对本端仍可见的好友行（对方已删/已拉黑除外）
        exec("""
                INSERT INTO im_friend (user_id, friend_id, created_at)
                SELECT b.blocked_user_id, b.user_id, COALESCE(b.created_at, NOW())
                FROM im_user_block b
                WHERE NOT EXISTS (
                    SELECT 1 FROM im_friend f
                    WHERE f.user_id = b.blocked_user_id AND f.friend_id = b.user_id
                )
                AND NOT EXISTS (
                    SELECT 1 FROM im_user_block b2
                    WHERE b2.user_id = b.blocked_user_id AND b2.blocked_user_id = b.user_id
                )
                AND NOT EXISTS (
                    SELECT 1 FROM im_friend_delete_log d
                    WHERE d.user_id = b.blocked_user_id
                      AND d.friend_id = b.user_id
                      AND d.reason = 'delete'
                )
                AND EXISTS (
                    SELECT 1 FROM im_friend_delete_log d
                    WHERE d.user_id = b.user_id
                      AND d.friend_id = b.blocked_user_id
                      AND d.reason = 'block'
                )
                ON CONFLICT (user_id, friend_id) DO NOTHING
                """);
        log.info("Schema migrate v42 applied");

        // v43: 拉黑改为保留好友关系；恢复拉黑方缺失的好友行，便于备注/朋友圈权限
        exec("""
                INSERT INTO im_friend (user_id, friend_id, remark, created_at)
                SELECT b.user_id, b.blocked_user_id, NULLIF(TRIM(b.remark), ''), COALESCE(b.created_at, NOW())
                FROM im_user_block b
                WHERE NOT EXISTS (
                    SELECT 1 FROM im_friend f
                    WHERE f.user_id = b.user_id AND f.friend_id = b.blocked_user_id
                )
                AND NOT EXISTS (
                    SELECT 1 FROM im_friend_delete_log d
                    WHERE d.user_id = b.user_id
                      AND d.friend_id = b.blocked_user_id
                      AND d.reason = 'delete'
                )
                ON CONFLICT (user_id, friend_id) DO NOTHING
                """);
        log.info("Schema migrate v43 applied");

        // v44: 修复历史拉黑导致的单边好友；取消拉黑后被拉黑方仍显示「不是好友」
        exec("""
                INSERT INTO im_friend (user_id, friend_id, add_source, add_initiator_id, created_at)
                SELECT f.friend_id, f.user_id, f.add_source, f.add_initiator_id, f.created_at
                FROM im_friend f
                WHERE NOT EXISTS (
                    SELECT 1 FROM im_friend f2
                    WHERE f2.user_id = f.friend_id AND f2.friend_id = f.user_id
                )
                AND NOT EXISTS (
                    SELECT 1 FROM im_friend_delete_log d
                    WHERE d.user_id = f.friend_id
                      AND d.friend_id = f.user_id
                      AND d.reason = 'delete'
                )
                ON CONFLICT (user_id, friend_id) DO NOTHING
                """);
        exec("""
                INSERT INTO im_friend (user_id, friend_id, add_source, add_initiator_id, created_at)
                SELECT d.user_id, d.friend_id, d.add_source, d.add_initiator_id,
                       COALESCE(d.friend_since, d.deleted_at, NOW())
                FROM im_friend_delete_log d
                WHERE d.reason = 'block'
                  AND NOT EXISTS (
                      SELECT 1 FROM im_friend f
                      WHERE f.user_id = d.user_id AND f.friend_id = d.friend_id
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM im_friend_delete_log x
                      WHERE x.user_id = d.user_id
                        AND x.friend_id = d.friend_id
                        AND x.reason = 'delete'
                        AND x.deleted_at > d.deleted_at
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM im_friend_delete_log x
                      WHERE x.user_id = d.friend_id
                        AND x.friend_id = d.user_id
                        AND x.reason = 'delete'
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM im_user_block b
                      WHERE (b.user_id = d.user_id AND b.blocked_user_id = d.friend_id)
                         OR (b.user_id = d.friend_id AND b.blocked_user_id = d.user_id)
                  )
                ON CONFLICT (user_id, friend_id) DO NOTHING
                """);
        exec("""
                INSERT INTO im_friend (user_id, friend_id, add_source, add_initiator_id, created_at)
                SELECT d.friend_id, d.user_id, d.add_source, d.add_initiator_id,
                       COALESCE(d.friend_since, d.deleted_at, NOW())
                FROM im_friend_delete_log d
                WHERE d.reason = 'block'
                  AND NOT EXISTS (
                      SELECT 1 FROM im_friend f
                      WHERE f.user_id = d.friend_id AND f.friend_id = d.user_id
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM im_friend_delete_log x
                      WHERE x.user_id = d.friend_id
                        AND x.friend_id = d.user_id
                        AND x.reason = 'delete'
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM im_friend_delete_log x
                      WHERE x.user_id = d.user_id
                        AND x.friend_id = d.friend_id
                        AND x.reason = 'delete'
                        AND x.deleted_at > d.deleted_at
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM im_user_block b
                      WHERE (b.user_id = d.user_id AND b.blocked_user_id = d.friend_id)
                         OR (b.user_id = d.friend_id AND b.blocked_user_id = d.user_id)
                  )
                ON CONFLICT (user_id, friend_id) DO NOTHING
                """);
        log.info("Schema migrate v44 applied");

        // v45: 通话记录区分语音 / 视频
        exec("ALTER TABLE im_call_log ADD COLUMN IF NOT EXISTS media_type VARCHAR(16) NOT NULL DEFAULT 'audio'");
        exec("CREATE INDEX IF NOT EXISTS idx_im_call_log_media ON im_call_log(media_type, created_at DESC)");
        exec("""
                UPDATE im_call_log c
                SET media_type = 'video'
                FROM im_message m
                WHERE m.client_msg_id = ('callrec_' || c.call_id)
                  AND (
                    m.content LIKE '%"kind":"video_call"%'
                    OR m.content LIKE '%"kind": "video_call"%'
                    OR m.content LIKE '%"mediaType":"video"%'
                    OR m.content LIKE '%"mediaType": "video"%'
                  )
                """);
        // 补录尚未落入 im_call_log 的通话 tip（含视频）
        exec("""
                INSERT INTO im_call_log(call_id, conversation_id, caller_id, callee_id, recorder_id, reason, result_text, connected, duration_sec, media_type, created_at)
                SELECT
                    SUBSTRING(m.client_msg_id FROM 9),
                    m.conversation_id,
                    m.from_user_id,
                    NULL,
                    m.from_user_id,
                    NULL,
                    LEFT(m.content, 128),
                    CASE
                      WHEN m.content LIKE '%通话时长%'
                        OR m.content LIKE '%"connected":true%'
                        OR m.content LIKE '%"connected": true%'
                      THEN TRUE ELSE FALSE
                    END,
                    0,
                    CASE
                      WHEN m.content LIKE '%"kind":"video_call"%'
                        OR m.content LIKE '%"kind": "video_call"%'
                        OR m.content LIKE '%"mediaType":"video"%'
                        OR m.content LIKE '%"mediaType": "video"%'
                      THEN 'video'
                      ELSE 'audio'
                    END,
                    COALESCE(m.send_time, NOW())
                FROM im_message m
                WHERE m.client_msg_id LIKE 'callrec_%'
                  AND LENGTH(m.client_msg_id) > 8
                  AND COALESCE(m.msg_type, 0) = 9
                  AND NOT EXISTS (
                    SELECT 1 FROM im_call_log c WHERE c.call_id = SUBSTRING(m.client_msg_id FROM 9)
                  )
                """);
        log.info("Schema migrate v45 applied");

        exec("""
                CREATE TABLE IF NOT EXISTS sys_text_config (
                    config_key VARCHAR(64) PRIMARY KEY,
                    title VARCHAR(128) NOT NULL,
                    content TEXT NOT NULL DEFAULT '',
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("""
                INSERT INTO sys_text_config(config_key, title, content)
                VALUES ('privacy_policy', '隐私政策', ''), ('service_terms', '服务条款', ''), ('community_join_agreement', '圈子加入协议', ''), ('community_create_agreement', '圈子创建协议', ''), ('account_deletion_agreement', '账号注销协议', '')
                ON CONFLICT (config_key) DO NOTHING
                """);
        log.info("Schema migrate v46 applied");

        exec("""
                CREATE TABLE IF NOT EXISTS sys_user_phone_change_log (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    old_phone VARCHAR(20),
                    new_phone VARCHAR(20) NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_user_phone_change_user ON sys_user_phone_change_log(user_id, created_at DESC)");
        exec("CREATE INDEX IF NOT EXISTS idx_user_phone_change_time ON sys_user_phone_change_log(created_at DESC)");
        log.info("Schema migrate v47 applied");

        exec("ALTER TABLE im_conversation ADD COLUMN IF NOT EXISTS member_friend_allowed BOOLEAN NOT NULL DEFAULT TRUE");
        exec("""
                UPDATE im_conversation_member m
                SET peer_user_id = other.user_id
                FROM im_conversation c
                JOIN im_conversation_member other ON other.conversation_id = c.id
                WHERE c.id = m.conversation_id
                  AND c.type = 1
                  AND other.user_id <> m.user_id
                  AND (m.peer_user_id IS NULL OR m.peer_user_id = m.user_id)
                """);
        log.info("Schema migrate v48 applied");

        exec("""
                CREATE TABLE IF NOT EXISTS im_burn_after_read_setting (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    conversation_id BIGINT NOT NULL,
                    enabled BOOLEAN NOT NULL DEFAULT FALSE,
                    burn_seconds INT NOT NULL DEFAULT 10,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(user_id, conversation_id)
                )
                """);
        exec("ALTER TABLE im_message ADD COLUMN IF NOT EXISTS burn_after_read BOOLEAN NOT NULL DEFAULT FALSE");
        exec("ALTER TABLE im_message ADD COLUMN IF NOT EXISTS burn_seconds INT");
        exec("ALTER TABLE im_message ADD COLUMN IF NOT EXISTS burn_read_at TIMESTAMPTZ");
        exec("ALTER TABLE im_message ADD COLUMN IF NOT EXISTS burn_expires_at TIMESTAMPTZ");
        exec("ALTER TABLE im_message ADD COLUMN IF NOT EXISTS burn_expired_notified BOOLEAN NOT NULL DEFAULT FALSE");
        exec("CREATE INDEX IF NOT EXISTS idx_im_message_burn_expiry ON im_message(burn_expires_at) WHERE burn_after_read = TRUE");
        log.info("Schema migrate v49 applied");

        exec("""
                CREATE TABLE IF NOT EXISTS sys_help_faq (
                    id BIGSERIAL PRIMARY KEY,
                    title VARCHAR(200) NOT NULL,
                    answer TEXT NOT NULL DEFAULT '',
                    sort_order INT NOT NULL DEFAULT 0,
                    enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_help_faq_enabled_sort ON sys_help_faq(enabled, sort_order, id)");
        exec("""
                CREATE TABLE IF NOT EXISTS sys_user_feedback (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    content VARCHAR(2000) NOT NULL,
                    image_urls TEXT NOT NULL DEFAULT '[]',
                    status VARCHAR(16) NOT NULL DEFAULT 'pending',
                    reply TEXT,
                    replied_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_user_feedback_status_time ON sys_user_feedback(status, created_at DESC)");
        exec("CREATE INDEX IF NOT EXISTS idx_user_feedback_user_time ON sys_user_feedback(user_id, created_at DESC)");
        log.info("Schema migrate v50 applied");

        exec("""
                CREATE TABLE IF NOT EXISTS sys_map_config (
                    id SMALLINT PRIMARY KEY CHECK (id = 1),
                    enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    baidu_ak VARCHAR(256) NOT NULL DEFAULT '',
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("""
                INSERT INTO sys_map_config(id, enabled, baidu_ak)
                VALUES (1, TRUE, '')
                ON CONFLICT (id) DO NOTHING
                """);
        exec("ALTER TABLE sys_map_config ADD COLUMN IF NOT EXISTS baidu_app_ak VARCHAR(256) NOT NULL DEFAULT ''");
        log.info("Schema migrate v51 applied");

        // v52: 群语音/视频通话记录
        exec("ALTER TABLE im_call_log ADD COLUMN IF NOT EXISTS call_type VARCHAR(16) NOT NULL DEFAULT 'private'");
        exec("ALTER TABLE im_call_log ADD COLUMN IF NOT EXISTS group_title VARCHAR(128)");
        exec("ALTER TABLE im_call_log ADD COLUMN IF NOT EXISTS participant_count INT NOT NULL DEFAULT 0");
        exec("CREATE INDEX IF NOT EXISTS idx_im_call_log_call_type ON im_call_log(call_type, created_at DESC)");
        log.info("Schema migrate v52 applied");

        exec("""
                CREATE TABLE IF NOT EXISTS sys_default_friend_config (
                    id SMALLINT PRIMARY KEY CHECK (id = 1),
                    enabled BOOLEAN NOT NULL DEFAULT FALSE,
                    friend_user_id BIGINT,
                    nickname_mode VARCHAR(16) NOT NULL DEFAULT 'original',
                    custom_nickname VARCHAR(64),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("""
                INSERT INTO sys_default_friend_config(id, enabled, nickname_mode)
                VALUES (1, FALSE, 'original')
                ON CONFLICT (id) DO NOTHING
                """);
        log.info("Schema migrate v53 applied");

        exec("""
                CREATE TABLE IF NOT EXISTS sys_default_friend_item (
                    friend_user_id BIGINT PRIMARY KEY,
                    nickname_mode VARCHAR(16) NOT NULL DEFAULT 'original',
                    custom_nickname VARCHAR(64),
                    sort_order INT NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("""
                INSERT INTO sys_default_friend_item(friend_user_id, nickname_mode, custom_nickname, sort_order)
                SELECT friend_user_id, nickname_mode, custom_nickname, 0
                FROM sys_default_friend_config
                WHERE id=1 AND friend_user_id IS NOT NULL
                ON CONFLICT (friend_user_id) DO NOTHING
                """);
        log.info("Schema migrate v54 applied");

        // v55: wallet, red packets and transfers. Money is stored in cents.
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS wallet_balance BIGINT NOT NULL DEFAULT 0");
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS payment_password_hash VARCHAR(100)");
        exec("""
                CREATE TABLE IF NOT EXISTS wallet_transaction (
                    id BIGSERIAL PRIMARY KEY,
                    trade_no VARCHAR(40) NOT NULL,
                    user_id BIGINT NOT NULL,
                    direction VARCHAR(8) NOT NULL,
                    trade_type VARCHAR(32) NOT NULL,
                    amount BIGINT NOT NULL,
                    balance_after BIGINT NOT NULL,
                    counterparty_user_id BIGINT,
                    conversation_id BIGINT,
                    remark VARCHAR(256),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_time ON wallet_transaction(user_id, created_at DESC)");
        exec("""
                CREATE TABLE IF NOT EXISTS red_packet (
                    id BIGSERIAL PRIMARY KEY,
                    packet_no VARCHAR(40) NOT NULL UNIQUE,
                    conversation_id BIGINT NOT NULL,
                    conversation_type SMALLINT NOT NULL,
                    sender_id BIGINT NOT NULL,
                    packet_type VARCHAR(20) NOT NULL,
                    target_user_id BIGINT,
                    total_amount BIGINT NOT NULL,
                    total_count INT NOT NULL,
                    received_amount BIGINT NOT NULL DEFAULT 0,
                    received_count INT NOT NULL DEFAULT 0,
                    greeting VARCHAR(128) NOT NULL DEFAULT '恭喜发财，大吉大利',
                    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_red_packet_conv_time ON red_packet(conversation_id, created_at DESC)");
        exec("""
                CREATE TABLE IF NOT EXISTS red_packet_receive (
                    id BIGSERIAL PRIMARY KEY,
                    packet_id BIGINT NOT NULL,
                    user_id BIGINT NOT NULL,
                    amount BIGINT NOT NULL,
                    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(packet_id, user_id)
                )
                """);
        exec("""
                CREATE TABLE IF NOT EXISTS wallet_transfer (
                    id BIGSERIAL PRIMARY KEY,
                    transfer_no VARCHAR(40) NOT NULL UNIQUE,
                    conversation_id BIGINT NOT NULL,
                    conversation_type SMALLINT NOT NULL,
                    sender_id BIGINT NOT NULL,
                    receiver_id BIGINT NOT NULL,
                    amount BIGINT NOT NULL,
                    remark VARCHAR(128),
                    status VARCHAR(16) NOT NULL DEFAULT 'RECEIVED',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    received_at TIMESTAMPTZ
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_wallet_transfer_conv_time ON wallet_transfer(conversation_id, created_at DESC)");
        exec("ALTER TABLE red_packet ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '48 hours')");
        exec("UPDATE red_packet SET expires_at=created_at + INTERVAL '48 hours' WHERE status='ACTIVE' AND expires_at < created_at + INTERVAL '48 hours'");
        exec("ALTER TABLE wallet_transfer ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ");
        exec("UPDATE wallet_transfer SET expires_at=created_at + INTERVAL '48 hours' WHERE expires_at IS NULL");
        exec("ALTER TABLE wallet_transfer ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '48 hours')");
        exec("CREATE INDEX IF NOT EXISTS idx_red_packet_expiry ON red_packet(expires_at) WHERE status='ACTIVE'");
        exec("CREATE INDEX IF NOT EXISTS idx_wallet_transfer_expiry ON wallet_transfer(expires_at) WHERE status='PENDING'");
        log.info("Schema migrate v55 applied");

        // v56: 登录日志补充设备摘要、安全码校验、是否新设备
        exec("ALTER TABLE sys_user_login_log ADD COLUMN IF NOT EXISTS device_summary VARCHAR(128)");
        exec("ALTER TABLE sys_user_login_log ADD COLUMN IF NOT EXISTS security_code_checked BOOLEAN");
        exec("ALTER TABLE sys_user_login_log ADD COLUMN IF NOT EXISTS new_device BOOLEAN");
        log.info("Schema migrate v56 applied");

        // v57: 默认好友标签（后台配置，用户端展示）
        exec("ALTER TABLE sys_default_friend_item ADD COLUMN IF NOT EXISTS tag VARCHAR(32)");
        exec("ALTER TABLE sys_default_friend_item ADD COLUMN IF NOT EXISTS greeting_text VARCHAR(500)");
        exec("ALTER TABLE im_friend ADD COLUMN IF NOT EXISTS tag VARCHAR(32)");
        log.info("Schema migrate v57 applied");

        // v58: 系统来电铃声配置
        exec("""
                CREATE TABLE IF NOT EXISTS sys_call_ringtone_config (
                    id SMALLINT PRIMARY KEY CHECK (id = 1),
                    enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    ringtone_url VARCHAR(512) NOT NULL DEFAULT '',
                    ringtone_name VARCHAR(128) NOT NULL DEFAULT '',
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("""
                INSERT INTO sys_call_ringtone_config(id, enabled, ringtone_url, ringtone_name)
                VALUES (1, TRUE, '', '')
                ON CONFLICT (id) DO NOTHING
                """);
        log.info("Schema migrate v58 applied");

        // v59: 多来电铃声目录 + 用户选用
        exec("""
                CREATE TABLE IF NOT EXISTS sys_call_ringtone (
                    id BIGSERIAL PRIMARY KEY,
                    name VARCHAR(128) NOT NULL DEFAULT '',
                    url VARCHAR(512) NOT NULL DEFAULT '',
                    enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    is_default BOOLEAN NOT NULL DEFAULT FALSE,
                    sort_order INT NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_call_ringtone_enabled_sort ON sys_call_ringtone(enabled, sort_order, id)");
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS ringtone_id BIGINT");
        exec("CREATE INDEX IF NOT EXISTS idx_sys_user_ringtone_id ON sys_user(ringtone_id)");
        exec("""
                INSERT INTO sys_call_ringtone(name, url, enabled, is_default, sort_order)
                SELECT
                    COALESCE(NULLIF(TRIM(ringtone_name), ''), '默认铃声'),
                    TRIM(ringtone_url),
                    COALESCE(enabled, TRUE),
                    TRUE,
                    0
                FROM sys_call_ringtone_config
                WHERE id = 1
                  AND TRIM(COALESCE(ringtone_url, '')) <> ''
                  AND NOT EXISTS (SELECT 1 FROM sys_call_ringtone LIMIT 1)
                """);
        log.info("Schema migrate v59 applied");

        // v60: 聊天敏感词
        exec("""
                CREATE TABLE IF NOT EXISTS sys_sensitive_word (
                    id BIGSERIAL PRIMARY KEY,
                    word VARCHAR(128) NOT NULL,
                    enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    CONSTRAINT uk_sys_sensitive_word UNIQUE (word)
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_sensitive_word_enabled ON sys_sensitive_word(enabled)");
        log.info("Schema migrate v60 applied");

        // v61: Android App version publishing and forced-update policy
        exec("""
                CREATE TABLE IF NOT EXISTS sys_app_version (
                    id SMALLINT PRIMARY KEY CHECK (id = 1),
                    version_code INT NOT NULL DEFAULT 1,
                    version_name VARCHAR(64) NOT NULL DEFAULT '1.0.0',
                    apk_url VARCHAR(512) NOT NULL DEFAULT '',
                    apk_name VARCHAR(255) NOT NULL DEFAULT '',
                    apk_size BIGINT NOT NULL DEFAULT 0,
                    release_notes TEXT NOT NULL DEFAULT '',
                    force_update BOOLEAN NOT NULL DEFAULT FALSE,
                    enabled BOOLEAN NOT NULL DEFAULT FALSE,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("""
                INSERT INTO sys_app_version(id, version_code, version_name)
                VALUES (1, 1, '1.0.0')
                ON CONFLICT (id) DO NOTHING
                """);
        log.info("Schema migrate v61 applied");

        // v62: clear legacy plaintext passwords while retaining the column for rollback compatibility.
        exec("UPDATE sys_user SET password_plain = NULL WHERE password_plain IS NOT NULL");
        log.info("Schema migrate v62 applied");
        exec("""
                CREATE TABLE IF NOT EXISTS im_auto_delete_setting (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    conversation_id BIGINT NOT NULL,
                    enabled BOOLEAN NOT NULL DEFAULT FALSE,
                    ttl_seconds INT NOT NULL DEFAULT 86400,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(user_id, conversation_id)
                )
                """);
        exec("ALTER TABLE im_message ADD COLUMN IF NOT EXISTS auto_delete_expires_at TIMESTAMPTZ");
        exec("CREATE INDEX IF NOT EXISTS idx_im_message_auto_delete_expiry ON im_message(auto_delete_expires_at) WHERE auto_delete_expires_at IS NOT NULL");
        log.info("Auto-delete message setting schema applied");
        // Fresh installations take the base migration path directly. Keep the
        // v64 user privacy columns on that path as well; otherwise the schema
        // version reaches the current marker while user-profile queries fail.
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS hide_online_status BOOLEAN NOT NULL DEFAULT FALSE");
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS read_receipt_enabled BOOLEAN NOT NULL DEFAULT TRUE");
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS typing_status_enabled BOOLEAN NOT NULL DEFAULT TRUE");
        createGroupV82Schema();
        createWalletAmountConfigSchema();
        createAccountDeletionSchema();
        log.info("User privacy settings schema applied");
        createClientAccessSchema();
        createFileConfigSchema();
        createCommunitySchema();
        createGroupAutomationSchema();
        createGroupPulseSchema();
        createNicknameConfigSchema();
        createFileObjectSchema();
        createContainerConfigSchema();
        if (migrationFailed) {
            log.warn("Schema migration finished with errors; version marker was not advanced");
            return;
        }
        jdbcTemplate.update(
                "INSERT INTO pulse_schema_version(version) VALUES (?) ON CONFLICT (version) DO NOTHING",
                CURRENT_VERSION
        );
        log.info("Schema version advanced to v{}", CURRENT_VERSION);
    }

    /** v89: separate chat-message metadata from binary objects in MinIO. */
    private void createFileObjectSchema() {
        exec("""
                CREATE TABLE IF NOT EXISTS im_file (
                    file_id VARCHAR(64) PRIMARY KEY,
                    uploader_id BIGINT NOT NULL,
                    object_key VARCHAR(512) NOT NULL UNIQUE,
                    thumb_object_key VARCHAR(512),
                    preview_object_key VARCHAR(512),
                    original_name VARCHAR(255) NOT NULL DEFAULT '',
                    content_type VARCHAR(128) NOT NULL DEFAULT 'application/octet-stream',
                    size_bytes BIGINT NOT NULL DEFAULT 0,
                    sha256 VARCHAR(128),
                    width INT,
                    height INT,
                    duration_ms BIGINT,
                    status VARCHAR(16) NOT NULL DEFAULT 'READY',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("ALTER TABLE im_message ADD COLUMN IF NOT EXISTS file_id VARCHAR(64)");
        exec("CREATE INDEX IF NOT EXISTS idx_im_message_file_id ON im_message(file_id)");
        exec("CREATE INDEX IF NOT EXISTS idx_im_file_uploader_created ON im_file(uploader_id, created_at DESC)");
        exec("CREATE INDEX IF NOT EXISTS idx_im_file_created_at ON im_file(created_at)");
        // 收藏是独立引用，原消息被用户删除后仍应能重新下载附件。
        exec("ALTER TABLE im_favorite ADD COLUMN IF NOT EXISTS file_id VARCHAR(64)");
        exec("ALTER TABLE im_favorite ADD COLUMN IF NOT EXISTS media_file_ids TEXT");
        exec("CREATE INDEX IF NOT EXISTS idx_im_favorite_file_id ON im_favorite(file_id)");
        exec("ALTER TABLE moment_comment ADD COLUMN IF NOT EXISTS image_file_id VARCHAR(64)");
        exec("ALTER TABLE moment_post ADD COLUMN IF NOT EXISTS media_file_ids TEXT");
        exec("CREATE INDEX IF NOT EXISTS idx_moment_comment_image_file_id ON moment_comment(image_file_id)");
        exec("ALTER TABLE community_post ADD COLUMN IF NOT EXISTS media_file_ids TEXT");
        exec("ALTER TABLE community_post ADD COLUMN IF NOT EXISTS quoted_media_file_ids TEXT");
    }

    private void createWalletSchema() {
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS wallet_balance BIGINT NOT NULL DEFAULT 0");
        exec("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS payment_password_hash VARCHAR(100)");
        exec("""
                CREATE TABLE IF NOT EXISTS wallet_transaction (
                    id BIGSERIAL PRIMARY KEY,
                    trade_no VARCHAR(40) NOT NULL,
                    user_id BIGINT NOT NULL,
                    direction VARCHAR(8) NOT NULL,
                    trade_type VARCHAR(32) NOT NULL,
                    amount BIGINT NOT NULL,
                    balance_after BIGINT NOT NULL,
                    counterparty_user_id BIGINT,
                    conversation_id BIGINT,
                    remark VARCHAR(256),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_time ON wallet_transaction(user_id, created_at DESC)");
    }

    private void createAccountDeletionSchema() {
        exec("""
                CREATE TABLE IF NOT EXISTS sys_user_deletion_log (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    phone VARCHAR(20),
                    pulse_id VARCHAR(7),
                    nickname VARCHAR(64),
                    wallet_balance BIGINT NOT NULL DEFAULT 0,
                    agreement_key VARCHAR(64) NOT NULL DEFAULT 'account_deletion_agreement',
                    agreement_title VARCHAR(128),
                    agreement_content TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_user_deletion_log_user ON sys_user_deletion_log(user_id, created_at DESC)");
        exec("CREATE INDEX IF NOT EXISTS idx_user_deletion_log_created ON sys_user_deletion_log(created_at DESC)");
    }

    private void createNicknameConfigSchema() {
        exec("""
                CREATE TABLE IF NOT EXISTS sys_nickname_config (
                    id SMALLINT PRIMARY KEY CHECK (id = 1),
                    user_nickname_max_length INT NOT NULL DEFAULT 20,
                    community_nickname_max_length INT NOT NULL DEFAULT 30,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("""
                INSERT INTO sys_nickname_config(id, user_nickname_max_length, community_nickname_max_length)
                VALUES (1, 20, 30)
                ON CONFLICT (id) DO NOTHING
                """);
    }

    private void createAutoDeleteSchema() {
        exec("""
                CREATE TABLE IF NOT EXISTS im_auto_delete_setting (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    conversation_id BIGINT NOT NULL,
                    enabled BOOLEAN NOT NULL DEFAULT FALSE,
                    ttl_seconds INT NOT NULL DEFAULT 86400,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(user_id, conversation_id)
                )
                """);
        exec("ALTER TABLE im_message ADD COLUMN IF NOT EXISTS auto_delete_expires_at TIMESTAMPTZ");
        exec("CREATE INDEX IF NOT EXISTS idx_im_message_auto_delete_expiry ON im_message(auto_delete_expires_at) WHERE auto_delete_expires_at IS NOT NULL");
    }

    private void createCommunitySchema() {
        exec("""
                CREATE TABLE IF NOT EXISTS community_topic (
                    id BIGSERIAL PRIMARY KEY, name VARCHAR(30) NOT NULL UNIQUE,
                    sort_order INT NOT NULL DEFAULT 0, enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("""
                CREATE TABLE IF NOT EXISTS community (
                    id BIGSERIAL PRIMARY KEY, name VARCHAR(30) NOT NULL, avatar TEXT,
                    description VARCHAR(500) NOT NULL DEFAULT '', rules VARCHAR(2000) NOT NULL DEFAULT '',
                    announcement TEXT NOT NULL DEFAULT '',
                    topic_id BIGINT REFERENCES community_topic(id), owner_id BIGINT NOT NULL REFERENCES sys_user(id),
                    type VARCHAR(10) NOT NULL DEFAULT 'FREE', price BIGINT NOT NULL DEFAULT 0,
                    join_review_required BOOLEAN NOT NULL DEFAULT FALSE,
                    post_mode VARCHAR(20) NOT NULL DEFAULT 'ALL', status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                    reject_reason VARCHAR(500), member_count INT NOT NULL DEFAULT 1, post_count INT NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_community_status_topic ON community(status, topic_id, created_at DESC)");
        exec("""
                CREATE TABLE IF NOT EXISTS community_member (
                    id BIGSERIAL PRIMARY KEY, community_id BIGINT NOT NULL REFERENCES community(id) ON DELETE CASCADE,
                    user_id BIGINT NOT NULL REFERENCES sys_user(id), role VARCHAR(10) NOT NULL DEFAULT 'MEMBER',
                    permissions VARCHAR(200) NOT NULL DEFAULT '', status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
                    muted_until TIMESTAMPTZ, join_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(community_id, user_id)
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_community_member_user ON community_member(user_id, status, join_time DESC)");
        exec("""
                CREATE TABLE IF NOT EXISTS community_post (
                    id BIGSERIAL PRIMARY KEY, community_id BIGINT NOT NULL REFERENCES community(id) ON DELETE CASCADE,
                    user_id BIGINT NOT NULL REFERENCES sys_user(id), content TEXT NOT NULL DEFAULT '', images TEXT,
                    video TEXT, link_url TEXT, status VARCHAR(16) NOT NULL DEFAULT 'PUBLISHED',
                    pinned BOOLEAN NOT NULL DEFAULT FALSE, pinned_at TIMESTAMPTZ, pinned_by BIGINT,
                    like_count INT NOT NULL DEFAULT 0, comment_count INT NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_community_post_feed ON community_post(community_id, status, created_at DESC)");
        createCommunityPostMediaSchema();
        exec("""
                CREATE TABLE IF NOT EXISTS community_order (
                    id BIGSERIAL PRIMARY KEY, order_no VARCHAR(40) NOT NULL UNIQUE,
                    community_id BIGINT NOT NULL REFERENCES community(id), buyer_id BIGINT NOT NULL REFERENCES sys_user(id),
                    amount BIGINT NOT NULL, platform_fee BIGINT NOT NULL, owner_income BIGINT NOT NULL,
                    platform_rate NUMERIC(5,2) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'PAID',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(community_id, buyer_id)
                )
                """);
        exec("""
                CREATE TABLE IF NOT EXISTS community_income (
                    id BIGSERIAL PRIMARY KEY, owner_id BIGINT NOT NULL REFERENCES sys_user(id),
                    community_id BIGINT NOT NULL REFERENCES community(id), order_id BIGINT REFERENCES community_order(id),
                    amount BIGINT NOT NULL, type VARCHAR(24) NOT NULL DEFAULT 'JOIN_INCOME',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("""
                CREATE TABLE IF NOT EXISTS community_config (
                    id SMALLINT PRIMARY KEY CHECK(id=1), platform_rate NUMERIC(5,2) NOT NULL DEFAULT 20.00,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("INSERT INTO community_config(id, platform_rate) VALUES(1,20.00) ON CONFLICT(id) DO NOTHING");
        exec("""
                INSERT INTO community_topic(name, sort_order) VALUES
                ('AI科技',10),('游戏',20),('摄影',30),('旅游',40),('投资',50),
                ('学习',60),('音乐',70),('运动',80),('生活',90),('其他',100)
                ON CONFLICT(name) DO NOTHING
                """);
        createCommunityInteractionSchema();
    }

    private void createCommunityPostMediaSchema() {
        exec("ALTER TABLE community_post ADD COLUMN IF NOT EXISTS original_images TEXT");
        exec("ALTER TABLE community_post ADD COLUMN IF NOT EXISTS media_types TEXT");
        exec("ALTER TABLE community_post ADD COLUMN IF NOT EXISTS location_name VARCHAR(255)");
        exec("ALTER TABLE community_post ADD COLUMN IF NOT EXISTS location_address VARCHAR(500)");
        exec("ALTER TABLE community_post ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION");
        exec("ALTER TABLE community_post ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION");
        exec("ALTER TABLE community_post ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE");
        exec("ALTER TABLE community_post ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ");
        exec("ALTER TABLE community_post ADD COLUMN IF NOT EXISTS pinned_by BIGINT");
        exec("ALTER TABLE community_post ADD COLUMN IF NOT EXISTS quoted_post_id BIGINT REFERENCES community_post(id) ON DELETE SET NULL");
        exec("ALTER TABLE community_post ADD COLUMN IF NOT EXISTS quoted_user_id BIGINT");
        exec("ALTER TABLE community_post ADD COLUMN IF NOT EXISTS quoted_nickname VARCHAR(100)");
        exec("ALTER TABLE community_post ADD COLUMN IF NOT EXISTS quoted_content TEXT");
        exec("ALTER TABLE community_post ADD COLUMN IF NOT EXISTS quoted_images TEXT");
        exec("ALTER TABLE community_post ADD COLUMN IF NOT EXISTS quoted_media_types TEXT");
        exec("ALTER TABLE community_post ADD COLUMN IF NOT EXISTS quoted_video TEXT");
        exec("CREATE INDEX IF NOT EXISTS idx_community_post_quoted_post ON community_post(quoted_post_id)");
        exec("CREATE INDEX IF NOT EXISTS idx_community_post_pinned_feed ON community_post(community_id,pinned DESC,pinned_at DESC,created_at DESC)");
    }

    private void createCommunityInteractionSchema() {
        exec("""
                CREATE TABLE IF NOT EXISTS community_post_like (
                    id BIGSERIAL PRIMARY KEY, post_id BIGINT NOT NULL REFERENCES community_post(id) ON DELETE CASCADE,
                    user_id BIGINT NOT NULL REFERENCES sys_user(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(post_id, user_id)
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_community_post_like_post ON community_post_like(post_id, created_at DESC)");
        exec("""
                CREATE TABLE IF NOT EXISTS community_post_comment (
                    id BIGSERIAL PRIMARY KEY, post_id BIGINT NOT NULL REFERENCES community_post(id) ON DELETE CASCADE,
                    user_id BIGINT NOT NULL REFERENCES sys_user(id), parent_id BIGINT REFERENCES community_post_comment(id),
                    content VARCHAR(1000) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'PUBLISHED',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_community_post_comment_post ON community_post_comment(post_id, created_at DESC)");
        exec("""
                CREATE TABLE IF NOT EXISTS community_post_favorite (
                    id BIGSERIAL PRIMARY KEY, post_id BIGINT NOT NULL REFERENCES community_post(id) ON DELETE CASCADE,
                    user_id BIGINT NOT NULL REFERENCES sys_user(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(post_id, user_id)
                )
                """);
        exec("""
                CREATE TABLE IF NOT EXISTS community_report (
                    id BIGSERIAL PRIMARY KEY, reporter_id BIGINT NOT NULL REFERENCES sys_user(id),
                    target_type VARCHAR(16) NOT NULL, target_id BIGINT NOT NULL, reason VARCHAR(32) NOT NULL,
                    detail VARCHAR(500), status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
                    handled_by BIGINT, handled_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_community_report_status ON community_report(status, created_at DESC)");
        exec("""
                CREATE TABLE IF NOT EXISTS community_notification (
                    id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES sys_user(id),
                    community_id BIGINT REFERENCES community(id) ON DELETE CASCADE, type VARCHAR(32) NOT NULL,
                    title VARCHAR(128) NOT NULL, content VARCHAR(500) NOT NULL DEFAULT '', read_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_community_notification_user ON community_notification(user_id, created_at DESC)");
        createCommunityV70Schema();
        createCommunityV71Schema();
        createCommunityV73Schema();
        createCommunityV74Schema();
        createCommunityV76Schema();
        createCommunityV77Schema();
        createCommunityV78Schema();
        createCommunityV86Schema();
        createDeviceSessionSchema();
    }

    private void createCommunityV73Schema() {
        exec("""
                CREATE TABLE IF NOT EXISTS community_member_removal_reason (
                    id BIGSERIAL PRIMARY KEY,
                    code VARCHAR(32) NOT NULL UNIQUE,
                    name VARCHAR(64) NOT NULL,
                    enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    sort_order INT NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_community_member_removal_reason_enabled ON community_member_removal_reason(enabled, sort_order, id)");
        exec("""
                INSERT INTO community_member_removal_reason(code,name,enabled,sort_order) VALUES
                    ('RULE_VIOLATION','违反圈子规则',TRUE,10),
                    ('ADVERTISING','发布广告或营销内容',TRUE,20),
                    ('HARASSMENT','骚扰或影响他人',TRUE,30),
                    ('INAPPROPRIATE_CONTENT','发布不当内容',TRUE,40),
                    ('OTHER','其他原因',TRUE,100)
                ON CONFLICT(code) DO NOTHING
                """);
    }

    private void createCommunityV74Schema() {
        exec("""
                CREATE TABLE IF NOT EXISTS community_risk_event (
                    id BIGSERIAL PRIMARY KEY,
                    community_id BIGINT REFERENCES community(id) ON DELETE SET NULL,
                    user_id BIGINT REFERENCES sys_user(id) ON DELETE SET NULL,
                    target_id BIGINT,
                    event_type VARCHAR(32) NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_community_risk_event_dashboard ON community_risk_event(event_type, created_at DESC)");
    }

    private void createCommunityV75Schema() {
        // v74 installations predate the quote columns used by the community feed.
        // Keep this idempotent so partially upgraded databases can safely retry.
        createCommunityPostMediaSchema();
    }

    private void createCommunityV76Schema() {
        exec("ALTER TABLE community ADD COLUMN IF NOT EXISTS platform_rate NUMERIC(5,2)");
    }

    private void createCommunityV77Schema() {
        exec("ALTER TABLE community_dissolve_log ADD COLUMN IF NOT EXISTS operator_type VARCHAR(16) NOT NULL DEFAULT 'USER'");
        // v76 之前的后台解散记录没有保存操作人类型，按管理员账号补回可识别的历史记录。
        exec("UPDATE community_dissolve_log SET operator_type='ADMIN' WHERE operator_type='USER' AND EXISTS (SELECT 1 FROM sys_admin a WHERE a.id=community_dissolve_log.operator_id)");
    }

    private void createCommunityV78Schema() {
        exec("""
                CREATE TABLE IF NOT EXISTS community_status_event (
                    id BIGSERIAL PRIMARY KEY,
                    community_id BIGINT NOT NULL REFERENCES community(id) ON DELETE CASCADE,
                    from_status VARCHAR(20),
                    to_status VARCHAR(20) NOT NULL,
                    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_community_status_event_time ON community_status_event(to_status,occurred_at DESC)");
        // Existing installations did not record status transitions. Seed a stable
        // baseline so the dashboard keeps historical rows; future transitions are exact.
        exec("""
                INSERT INTO community_status_event(community_id,from_status,to_status,occurred_at)
                SELECT c.id,NULL,c.status,
                       CASE WHEN c.status='DISSOLVED'
                            THEN COALESCE((SELECT MAX(d.created_at) FROM community_dissolve_log d WHERE d.community_id=c.id),c.updated_at)
                            WHEN c.status='CLOSED' THEN c.updated_at
                            ELSE c.created_at END
                FROM community c
                WHERE c.status IN ('APPROVED','CLOSED','DISSOLVED')
                  AND NOT EXISTS (SELECT 1 FROM community_status_event e WHERE e.community_id=c.id)
                """);
    }

    private void createCommunityV70Schema() {
        exec("ALTER TABLE community ADD COLUMN IF NOT EXISTS announcement TEXT NOT NULL DEFAULT ''");
        exec("ALTER TABLE community_report ADD COLUMN IF NOT EXISTS evidence_urls TEXT");
        exec("ALTER TABLE community_report ADD COLUMN IF NOT EXISTS evidence_types TEXT");
        exec("""
                CREATE TABLE IF NOT EXISTS community_report_reason (
                    id BIGSERIAL PRIMARY KEY,
                    code VARCHAR(32) NOT NULL UNIQUE,
                    name VARCHAR(64) NOT NULL,
                    enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    sort_order INT NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_community_report_reason_enabled ON community_report_reason(enabled, sort_order, id)");
        exec("""
                INSERT INTO community_report_reason(code,name,enabled,sort_order) VALUES
                    ('PORN','色情低俗',TRUE,10),
                    ('FRAUD','欺诈诈骗',TRUE,20),
                    ('AD','广告骚扰',TRUE,30),
                    ('VIOLENCE','暴力血腥',TRUE,40),
                    ('ILLEGAL','违法违规',TRUE,50),
                    ('OTHER','其他',TRUE,100)
                ON CONFLICT(code) DO NOTHING
                """);
        exec("ALTER TABLE community_notification ADD COLUMN IF NOT EXISTS post_id BIGINT REFERENCES community_post(id) ON DELETE CASCADE");
        exec("ALTER TABLE community_notification ADD COLUMN IF NOT EXISTS comment_id BIGINT REFERENCES community_post_comment(id) ON DELETE SET NULL");
        exec("ALTER TABLE community_notification ADD COLUMN IF NOT EXISTS actor_id BIGINT REFERENCES sys_user(id) ON DELETE SET NULL");
        exec("CREATE INDEX IF NOT EXISTS idx_community_notification_unread ON community_notification(user_id, created_at DESC) WHERE read_at IS NULL");
        exec("""
                CREATE TABLE IF NOT EXISTS community_post_comment_like (
                    id BIGSERIAL PRIMARY KEY,
                    comment_id BIGINT NOT NULL REFERENCES community_post_comment(id) ON DELETE CASCADE,
                    user_id BIGINT NOT NULL REFERENCES sys_user(id),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(comment_id, user_id)
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_community_post_comment_like_comment ON community_post_comment_like(comment_id, created_at DESC)");
    }

    private void createCommunityV71Schema() {
        exec("ALTER TABLE community ADD COLUMN IF NOT EXISTS join_review_required BOOLEAN NOT NULL DEFAULT FALSE");
        exec("ALTER TABLE community ADD COLUMN IF NOT EXISTS leave_review_required BOOLEAN NOT NULL DEFAULT FALSE");
        exec("ALTER TABLE community_member ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()");
        exec("""
                CREATE TABLE IF NOT EXISTS community_join_request (
                    id BIGSERIAL PRIMARY KEY,
                    community_id BIGINT NOT NULL REFERENCES community(id) ON DELETE CASCADE,
                    user_id BIGINT NOT NULL REFERENCES sys_user(id) ON DELETE CASCADE,
                    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
                    reviewed_by BIGINT,
                    reviewed_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(community_id,user_id)
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_community_join_request_review ON community_join_request(community_id,status,created_at DESC)");
        exec("""
                CREATE TABLE IF NOT EXISTS community_leave_request (
                    id BIGSERIAL PRIMARY KEY, community_id BIGINT NOT NULL REFERENCES community(id) ON DELETE CASCADE,
                    user_id BIGINT NOT NULL REFERENCES sys_user(id), reason VARCHAR(500) NOT NULL DEFAULT '',
                    status VARCHAR(16) NOT NULL DEFAULT 'PENDING', reviewed_by BIGINT, reviewed_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(community_id,user_id)
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_community_leave_request_review ON community_leave_request(community_id,status,created_at DESC)");
        exec("""
                CREATE TABLE IF NOT EXISTS community_member_event (
                    id BIGSERIAL PRIMARY KEY, community_id BIGINT NOT NULL, user_id BIGINT NOT NULL,
                    event_type VARCHAR(24) NOT NULL, reason VARCHAR(500) NOT NULL DEFAULT '', operator_id BIGINT,
                    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_community_member_event_time ON community_member_event(community_id,occurred_at DESC)");
        exec("""
                CREATE TABLE IF NOT EXISTS community_owner_transfer_log (
                    id BIGSERIAL PRIMARY KEY, community_id BIGINT NOT NULL, previous_owner_id BIGINT NOT NULL,
                    new_owner_id BIGINT NOT NULL, reason VARCHAR(500) NOT NULL DEFAULT '', operator_id BIGINT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_community_owner_transfer_time ON community_owner_transfer_log(created_at DESC)");
        exec("""
                CREATE TABLE IF NOT EXISTS community_dissolve_log (
                    id BIGSERIAL PRIMARY KEY, community_id BIGINT NOT NULL, community_name VARCHAR(30) NOT NULL,
                    owner_id BIGINT NOT NULL, reason VARCHAR(500) NOT NULL DEFAULT '', operator_id BIGINT NOT NULL,
                    operator_type VARCHAR(16) NOT NULL DEFAULT 'USER',
                    member_count INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_community_dissolve_time ON community_dissolve_log(created_at DESC)");
        exec("""
                CREATE TABLE IF NOT EXISTS community_profile_review (
                    id BIGSERIAL PRIMARY KEY,
                    community_id BIGINT NOT NULL REFERENCES community(id) ON DELETE CASCADE,
                    applicant_id BIGINT NOT NULL REFERENCES sys_user(id),
                    proposed_name VARCHAR(30),
                    proposed_avatar TEXT,
                    changed_name BOOLEAN NOT NULL DEFAULT FALSE,
                    changed_avatar BOOLEAN NOT NULL DEFAULT FALSE,
                    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
                    reject_reason VARCHAR(500),
                    reviewed_by BIGINT,
                    reviewed_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE UNIQUE INDEX IF NOT EXISTS uk_community_profile_review_pending ON community_profile_review(community_id) WHERE status='PENDING'");
        exec("CREATE INDEX IF NOT EXISTS idx_community_profile_review_status ON community_profile_review(status,created_at DESC)");
    }

    private void createCommunityV86Schema() {
        exec("ALTER TABLE community_owner_transfer_log ADD COLUMN IF NOT EXISTS operator_type VARCHAR(16) NOT NULL DEFAULT 'USER'");
        exec("UPDATE community_owner_transfer_log SET operator_type='ADMIN' WHERE operator_type='USER' AND EXISTS (SELECT 1 FROM sys_admin a WHERE a.id=community_owner_transfer_log.operator_id)");
    }

    private void exec(String sql) {
        // Keep the legacy rename idempotent as well. A partially upgraded
        // database may already have removed (and the old source line can be
        // present in installations created by an earlier build).
        if ("ALTER TABLE moment_post RENAME COLUMN deleted TO removed".equals(sql)) {
            sql = "ALTER TABLE moment_post ADD COLUMN IF NOT EXISTS removed BOOLEAN NOT NULL DEFAULT FALSE";
        }
        try {
            if (!TransactionSynchronizationManager.isActualTransactionActive()) {
                // Keep the plain-SQL path for callers that invoke the runner
                // directly (including the lightweight migration tests).
                jdbcTemplate.execute(sql);
                return;
            }

            // Keep one failed, optional migration statement from aborting the
            // surrounding PostgreSQL transaction. Later idempotent repairs
            // must still be able to run on partially upgraded databases.
            java.sql.Savepoint savepoint = jdbcTemplate.execute(
                    (org.springframework.jdbc.core.ConnectionCallback<java.sql.Savepoint>) connection -> connection.setSavepoint()
            );
            try {
                jdbcTemplate.execute(sql);
            } catch (Exception statementError) {
                rollbackToSavepoint(savepoint, statementError);
                throw statementError;
            } finally {
                releaseSavepoint(savepoint);
            }
        } catch (Exception e) {
            migrationFailed = true;
            if (failFast) {
                throw new IllegalStateException("Database migration failed: " + abbreviate(sql), e);
            }
            log.warn("migrate skip: {} [{}]", e.getMessage(), abbreviate(sql), e);
        }
    }

    private void rollbackToSavepoint(java.sql.Savepoint savepoint, Exception statementError) {
        if (savepoint == null) {
            return;
        }
        try {
            jdbcTemplate.execute((org.springframework.jdbc.core.ConnectionCallback<Void>) connection -> {
                connection.rollback(savepoint);
                return null;
            });
        } catch (Exception rollbackError) {
            statementError.addSuppressed(rollbackError);
        }
    }

    private void releaseSavepoint(java.sql.Savepoint savepoint) {
        if (savepoint == null) {
            return;
        }
        try {
            jdbcTemplate.execute((org.springframework.jdbc.core.ConnectionCallback<Void>) connection -> {
                connection.releaseSavepoint(savepoint);
                return null;
            });
        } catch (Exception ignored) {
            // A rollback may already have released the savepoint.
        }
    }

    private void createDeviceSessionSchema() {
        exec("""
                CREATE TABLE IF NOT EXISTS sys_user_trusted_device (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    device_id VARCHAR(128) NOT NULL,
                    trusted_at TIMESTAMPTZ,
                    login_at TIMESTAMPTZ,
                    UNIQUE(user_id, device_id)
                )
                """);
        exec("ALTER TABLE sys_user_trusted_device ALTER COLUMN trusted_at DROP NOT NULL");
        exec("ALTER TABLE sys_user_trusted_device ADD COLUMN IF NOT EXISTS device_name VARCHAR(128)");
        exec("ALTER TABLE sys_user_trusted_device ADD COLUMN IF NOT EXISTS platform VARCHAR(32)");
        exec("ALTER TABLE sys_user_trusted_device ADD COLUMN IF NOT EXISTS trusted BOOLEAN NOT NULL DEFAULT FALSE");
        exec("ALTER TABLE sys_user_trusted_device ADD COLUMN IF NOT EXISTS login_at TIMESTAMPTZ");
        exec("ALTER TABLE sys_user_trusted_device ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()");
        exec("UPDATE sys_user_trusted_device SET login_at=last_active_at WHERE login_at IS NULL");
        exec("ALTER TABLE sys_user_trusted_device ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ");
        exec("CREATE INDEX IF NOT EXISTS idx_user_device_active ON sys_user_trusted_device(user_id, revoked_at, last_active_at DESC)");
    }

    private void createClientAccessSchema() {
        exec("""
                CREATE TABLE IF NOT EXISTS sys_client_access_config (
                    id SMALLINT PRIMARY KEY CHECK (id = 1),
                    windows_phone_login_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    windows_qr_login_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    windows_register_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    windows_wallet_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("ALTER TABLE sys_client_access_config ADD COLUMN IF NOT EXISTS windows_wallet_enabled BOOLEAN NOT NULL DEFAULT TRUE");
        exec("""
                INSERT INTO sys_client_access_config(
                    id, windows_phone_login_enabled, windows_qr_login_enabled, windows_register_enabled, windows_wallet_enabled
                ) VALUES (1, TRUE, TRUE, TRUE, TRUE)
                ON CONFLICT (id) DO NOTHING
                """);
    }

    private void createFileConfigSchema() {
        exec("""
                CREATE TABLE IF NOT EXISTS sys_file_config (
                    id SMALLINT PRIMARY KEY CHECK (id = 1),
                    max_size_mb INT NOT NULL DEFAULT 100,
                    allowed_extensions TEXT NOT NULL DEFAULT '',
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("""
                INSERT INTO sys_file_config(id, max_size_mb, allowed_extensions)
                VALUES (1, 100, '')
                ON CONFLICT (id) DO NOTHING
                """);
    }

    /** 群搜索权限、成员邀请权限及免打扰重要消息偏好。 */
    private void createGroupV82Schema() {
        exec("ALTER TABLE im_conversation ADD COLUMN IF NOT EXISTS search_mode SMALLINT NOT NULL DEFAULT 3");
        exec("ALTER TABLE im_conversation ADD COLUMN IF NOT EXISTS member_invite_allowed BOOLEAN NOT NULL DEFAULT TRUE");
        exec("ALTER TABLE im_conversation_member ADD COLUMN IF NOT EXISTS important_at_all BOOLEAN NOT NULL DEFAULT TRUE");
        exec("ALTER TABLE im_conversation_member ADD COLUMN IF NOT EXISTS important_mention_me BOOLEAN NOT NULL DEFAULT TRUE");
        exec("ALTER TABLE im_conversation_member ADD COLUMN IF NOT EXISTS important_reply_me BOOLEAN NOT NULL DEFAULT TRUE");
        exec("ALTER TABLE im_conversation_member ADD COLUMN IF NOT EXISTS important_announcement BOOLEAN NOT NULL DEFAULT TRUE");
        exec("ALTER TABLE im_conversation_member ADD COLUMN IF NOT EXISTS important_followed_member_ids TEXT NOT NULL DEFAULT ''");
        exec("UPDATE im_conversation SET search_mode = 3 WHERE search_mode IS NULL OR search_mode < 1 OR search_mode > 3");
    }

    /** 随机群 PulseID：对外不再暴露可递增的会话主键。 */
    private void createGroupPulseSchema() {
        exec("ALTER TABLE im_conversation ADD COLUMN IF NOT EXISTS group_pulse_id VARCHAR(16)");
        exec("""
                DO $$
                DECLARE
                    row_data RECORD;
                    candidate VARCHAR(16);
                BEGIN
                    FOR row_data IN
                        SELECT id FROM im_conversation
                        WHERE type = 2 AND (group_pulse_id IS NULL OR BTRIM(group_pulse_id) = '')
                    LOOP
                        LOOP
                            candidate := (1000000000 + FLOOR(random() * 9000000000))::BIGINT::TEXT;
                            EXIT WHEN NOT EXISTS (
                                SELECT 1 FROM im_conversation
                                WHERE group_pulse_id = candidate
                            );
                        END LOOP;
                        UPDATE im_conversation SET group_pulse_id = candidate WHERE id = row_data.id;
                    END LOOP;
                END $$;
                """);
        exec("CREATE UNIQUE INDEX IF NOT EXISTS uk_im_conversation_group_pulse_id ON im_conversation(group_pulse_id) WHERE group_pulse_id IS NOT NULL");
    }

    /** 群聊欢迎语、一次性定时消息及消息来源标记。 */
    private void createGroupAutomationSchema() {
        exec("ALTER TABLE im_conversation ADD COLUMN IF NOT EXISTS group_welcome_message TEXT");
        exec("ALTER TABLE im_conversation ADD COLUMN IF NOT EXISTS group_welcome_setter_id BIGINT");
        exec("ALTER TABLE im_message ADD COLUMN IF NOT EXISTS scheduled_message BOOLEAN NOT NULL DEFAULT FALSE");
        exec("""
                CREATE TABLE IF NOT EXISTS im_group_scheduled_message (
                    id BIGSERIAL PRIMARY KEY,
                    conversation_id BIGINT NOT NULL REFERENCES im_conversation(id) ON DELETE CASCADE,
                    setter_id BIGINT NOT NULL REFERENCES sys_user(id) ON DELETE RESTRICT,
                    msg_type INT NOT NULL DEFAULT 0,
                    content TEXT NOT NULL,
                    send_at TIMESTAMPTZ NOT NULL,
                    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
                    last_error TEXT,
                    sent_msg_id VARCHAR(64),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("CREATE INDEX IF NOT EXISTS idx_im_group_scheduled_due ON im_group_scheduled_message(status, send_at, id)");
        exec("CREATE INDEX IF NOT EXISTS idx_im_group_scheduled_conversation ON im_group_scheduled_message(conversation_id, status, send_at)");
    }

    private void createWalletAmountConfigSchema() {
        exec("""
                CREATE TABLE IF NOT EXISTS sys_wallet_amount_config (
                    id SMALLINT PRIMARY KEY CHECK (id = 1),
                    red_packet_max_cents BIGINT NOT NULL DEFAULT 20000,
                    transfer_max_cents BIGINT NOT NULL DEFAULT 1000000,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("""
                INSERT INTO sys_wallet_amount_config(id, red_packet_max_cents, transfer_max_cents)
                VALUES (1, 20000, 1000000)
                ON CONFLICT (id) DO NOTHING
        """);
    }

    private void createContainerConfigSchema() {
        exec("""
                CREATE TABLE IF NOT EXISTS sys_container_config (
                    id SMALLINT PRIMARY KEY CHECK (id = 1),
                    target_server_origin VARCHAR(512) NOT NULL DEFAULT '',
                    migrate_legacy_data BOOLEAN NOT NULL DEFAULT FALSE,
                    migration_status VARCHAR(32) NOT NULL DEFAULT 'IDLE',
                    migration_message TEXT NOT NULL DEFAULT '',
                    migration_started_at TIMESTAMPTZ,
                    migration_updated_at TIMESTAMPTZ,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        exec("ALTER TABLE sys_container_config ADD COLUMN IF NOT EXISTS migrate_legacy_data BOOLEAN NOT NULL DEFAULT FALSE");
        exec("""
                INSERT INTO sys_container_config(id)
                VALUES (1)
                ON CONFLICT (id) DO NOTHING
                """);
    }

    private String abbreviate(String sql) {
        String normalized = sql == null ? "" : sql.replaceAll("\\s+", " ").trim();
        return normalized.length() <= 160 ? normalized : normalized.substring(0, 160) + "...";
    }
}
