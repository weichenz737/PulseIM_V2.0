-- PulseIM PostgreSQL schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS sys_user (
    id              BIGSERIAL PRIMARY KEY,
    phone           VARCHAR(20)  NOT NULL UNIQUE,
    password_hash   VARCHAR(100) NOT NULL,
    nickname        VARCHAR(64)  NOT NULL,
    avatar_url      VARCHAR(512),
    file_transfer_assistant BOOLEAN NOT NULL DEFAULT FALSE,
    status          SMALLINT     NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sys_admin (
    id              BIGSERIAL PRIMARY KEY,
    username        VARCHAR(64)  NOT NULL UNIQUE,
    password_hash   VARCHAR(100) NOT NULL,
    nickname        VARCHAR(64)  NOT NULL,
    status          SMALLINT     NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS im_conversation (
    id              BIGSERIAL PRIMARY KEY,
    type            SMALLINT     NOT NULL DEFAULT 1,
    title           VARCHAR(128),
    avatar_url      VARCHAR(512),
    last_msg_preview VARCHAR(512),
    last_msg_time   TIMESTAMPTZ,
    owner_id        BIGINT,
    notice          TEXT,
    mute_all        BOOLEAN      NOT NULL DEFAULT FALSE,
    join_verify_required BOOLEAN NOT NULL DEFAULT FALSE,
    member_friend_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    search_mode     SMALLINT     NOT NULL DEFAULT 3,
    member_invite_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS im_conversation_member (
    id              BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT       NOT NULL REFERENCES im_conversation(id),
    user_id         BIGINT       NOT NULL REFERENCES sys_user(id),
    unread_count    INT          NOT NULL DEFAULT 0,
    mute            BOOLEAN      NOT NULL DEFAULT FALSE,
    archived        BOOLEAN      NOT NULL DEFAULT FALSE,
    pinned          BOOLEAN      NOT NULL DEFAULT FALSE,
    hidden          BOOLEAN      NOT NULL DEFAULT FALSE,
    peer_user_id    BIGINT,
    role            VARCHAR(16)  NOT NULL DEFAULT 'member',
    important_at_all BOOLEAN      NOT NULL DEFAULT TRUE,
    important_mention_me BOOLEAN  NOT NULL DEFAULT TRUE,
    important_reply_me BOOLEAN    NOT NULL DEFAULT TRUE,
    important_announcement BOOLEAN NOT NULL DEFAULT TRUE,
    important_followed_member_ids TEXT NOT NULL DEFAULT '',
    joined_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS im_message (
    id              BIGSERIAL PRIMARY KEY,
    msg_id          VARCHAR(64)  NOT NULL UNIQUE,
    conversation_id BIGINT       NOT NULL REFERENCES im_conversation(id),
    from_user_id    BIGINT       NOT NULL,
    msg_type        SMALLINT     NOT NULL DEFAULT 0,
    content         TEXT         NOT NULL,
    client_msg_id   VARCHAR(64),
    reply_to_msg_id VARCHAR(64),
    recalled        BOOLEAN      NOT NULL DEFAULT FALSE,
    send_time       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_im_msg_conv_time ON im_message(conversation_id, send_time DESC);
CREATE INDEX IF NOT EXISTS idx_im_member_user ON im_conversation_member(user_id);
