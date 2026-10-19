package com.pulse.api.service;

import com.pulse.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 红包和转账的系统级金额上限。数据库统一按分存储，管理端按元编辑。 */
@Service
@RequiredArgsConstructor
public class WalletAmountConfigService {
    public static final long DEFAULT_RED_PACKET_MAX_CENTS = 20_000L;
    public static final long DEFAULT_TRANSFER_MAX_CENTS = 1_000_000L;
    private static final long MAX_CONFIG_CENTS = 100_000_000L;

    private final JdbcTemplate jdbcTemplate;

    public Map<String, Object> getClientConfig() {
        Limits limits = getLimits();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("redPacketMaxCents", limits.redPacketMaxCents());
        result.put("transferMaxCents", limits.transferMaxCents());
        return result;
    }

    public Map<String, Object> getAdminConfig() {
        Limits limits = getLimits();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("redPacketMaxAmount", toYuan(limits.redPacketMaxCents()));
        result.put("transferMaxAmount", toYuan(limits.transferMaxCents()));
        result.put("redPacketMaxCents", limits.redPacketMaxCents());
        result.put("transferMaxCents", limits.transferMaxCents());
        result.put("updatedAt", limits.updatedAt());
        return result;
    }

    @Transactional
    public Map<String, Object> update(BigDecimal redPacketMaxAmount, BigDecimal transferMaxAmount) {
        long redPacketMaxCents = toCents(redPacketMaxAmount, "红包上限");
        long transferMaxCents = toCents(transferMaxAmount, "转账上限");
        jdbcTemplate.update("""
                INSERT INTO sys_wallet_amount_config(
                    id, red_packet_max_cents, transfer_max_cents, updated_at
                ) VALUES (1, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    red_packet_max_cents = EXCLUDED.red_packet_max_cents,
                    transfer_max_cents = EXCLUDED.transfer_max_cents,
                    updated_at = EXCLUDED.updated_at
                """, redPacketMaxCents, transferMaxCents, OffsetDateTime.now());
        return getAdminConfig();
    }

    public Limits getLimits() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT red_packet_max_cents, transfer_max_cents, updated_at
                FROM sys_wallet_amount_config
                WHERE id = 1
                """);
        if (rows.isEmpty()) {
            return new Limits(DEFAULT_RED_PACKET_MAX_CENTS, DEFAULT_TRANSFER_MAX_CENTS, null);
        }
        Map<String, Object> row = rows.get(0);
        return new Limits(
                safeCents(row.get("red_packet_max_cents"), DEFAULT_RED_PACKET_MAX_CENTS),
                safeCents(row.get("transfer_max_cents"), DEFAULT_TRANSFER_MAX_CENTS),
                row.get("updated_at")
        );
    }

    public static String toYuanText(long cents) {
        return toYuan(cents).stripTrailingZeros().toPlainString();
    }

    private static BigDecimal toYuan(long cents) {
        return BigDecimal.valueOf(cents, 2);
    }

    private static long safeCents(Object value, long fallback) {
        if (!(value instanceof Number number)) return fallback;
        long cents = number.longValue();
        return cents > 0 && cents <= MAX_CONFIG_CENTS ? cents : fallback;
    }

    private static long toCents(BigDecimal amount, String label) {
        if (amount == null) {
            throw new BizException(label + "不能为空");
        }
        BigDecimal normalized = amount.setScale(2, RoundingMode.HALF_UP);
        BigDecimal max = BigDecimal.valueOf(MAX_CONFIG_CENTS, 2);
        if (normalized.compareTo(BigDecimal.valueOf(0.01)) < 0 || normalized.compareTo(max) > 0) {
            throw new BizException(label + "须在0.01-" + toYuanText(MAX_CONFIG_CENTS) + "元之间");
        }
        return normalized.movePointRight(2).longValueExact();
    }

    public record Limits(long redPacketMaxCents, long transferMaxCents, Object updatedAt) {
    }
}
