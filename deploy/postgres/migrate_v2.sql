-- PulseIM incremental schema for contacts / moments / profile
ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS gender VARCHAR(16);
ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS region VARCHAR(128);
ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS signature VARCHAR(512);

CREATE TABLE IF NOT EXISTS im_friend (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES sys_user(id),
    friend_id       BIGINT NOT NULL REFERENCES sys_user(id),
    remark          VARCHAR(64),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, friend_id)
);

CREATE TABLE IF NOT EXISTS moment_post (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES sys_user(id),
    content         TEXT NOT NULL,
    images          TEXT,
    like_count      INT NOT NULL DEFAULT 0,
    comment_count   INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_im_friend_user ON im_friend(user_id);
CREATE INDEX IF NOT EXISTS idx_moment_post_time ON moment_post(created_at DESC);
