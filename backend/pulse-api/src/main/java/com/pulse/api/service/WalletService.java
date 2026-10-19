package com.pulse.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pulse.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.util.*;
import com.pulse.common.constant.RedisKeys;

@Service
@RequiredArgsConstructor
@Slf4j
public class WalletService {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwordEncoder;
    private final SocialService socialService;
    private final ObjectMapper objectMapper;
    private final StringRedisTemplate redis;
    private final WalletAmountConfigService walletAmountConfigService;

    public Map<String, Object> amountConfig() {
        return walletAmountConfigService.getClientConfig();
    }

    public Map<String, Object> summary(Long userId) {
        Map<String, Object> row = jdbc.queryForMap(
                "SELECT wallet_balance, payment_password_hash IS NOT NULL AS has_payment_password FROM sys_user WHERE id=?", userId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("balance", number(row.get("wallet_balance")));
        result.put("hasPaymentPassword", Boolean.TRUE.equals(row.get("has_payment_password")));
        return result;
    }

    public void setPaymentPassword(Long userId, String password, String oldPassword) {
        if (password == null || !password.matches("\\d{6}")) throw new BizException("支付密码必须为6位数字");
        String current = jdbc.queryForObject("SELECT payment_password_hash FROM sys_user WHERE id=?", String.class, userId);
        if (StringUtils.hasText(current) && !passwordEncoder.matches(oldPassword == null ? "" : oldPassword, current)) {
            throw new BizException("原支付密码错误");
        }
        jdbc.update("UPDATE sys_user SET payment_password_hash=?, updated_at=NOW() WHERE id=?",
                passwordEncoder.encode(password), userId);
    }

    public void resetPaymentPasswordBySms(Long userId, String code, String password) {
        if (password == null || !password.matches("\\d{6}")) {
            throw new BizException("支付密码必须为6位数字");
        }
        String phone = jdbc.queryForObject("SELECT phone FROM sys_user WHERE id=?", String.class, userId);
        String cached = redis.opsForValue().get(RedisKeys.smsCode(phone));
        if (!StringUtils.hasText(code) || !Objects.equals(cached, code.trim())) {
            throw new BizException("验证码错误或已过期");
        }
        jdbc.update("UPDATE sys_user SET payment_password_hash=?,updated_at=NOW() WHERE id=?",
                passwordEncoder.encode(password), userId);
        redis.delete(RedisKeys.smsCode(phone));
    }

    public List<Map<String, Object>> transactions(Long userId, String type, OffsetDateTime from, OffsetDateTime to) {
        StringBuilder sql = new StringBuilder("""
                SELECT t.id,t.trade_no,t.direction,t.trade_type,t.amount,t.balance_after,t.counterparty_user_id,
                       COALESCE(NULLIF(TRIM(fr.remark),''), u.nickname) AS counterparty_name,
                       t.conversation_id,t.remark,t.created_at
                FROM wallet_transaction t
                LEFT JOIN sys_user u ON u.id=t.counterparty_user_id
                LEFT JOIN im_friend fr ON fr.user_id=t.user_id AND fr.friend_id=t.counterparty_user_id
                WHERE t.user_id=?
                """);
        List<Object> args = new ArrayList<>();
        args.add(userId);
        if (StringUtils.hasText(type)) { sql.append(" AND t.trade_type=?"); args.add(type); }
        if (from != null) { sql.append(" AND t.created_at>=?"); args.add(from); }
        if (to != null) { sql.append(" AND t.created_at<=?"); args.add(to); }
        sql.append(" ORDER BY t.created_at DESC LIMIT 500");
        return jdbc.queryForList(sql.toString(), args.toArray());
    }

    public Map<String, Object> transactionDetail(Long userId, Long transactionId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT t.id,t.trade_no,t.direction,t.trade_type,t.amount,t.balance_after,
                       t.counterparty_user_id,
                       COALESCE(NULLIF(TRIM(fr.remark),''), u.nickname) AS counterparty_name,
                       t.conversation_id,t.remark,t.created_at
                FROM wallet_transaction t
                LEFT JOIN sys_user u ON u.id=t.counterparty_user_id
                LEFT JOIN im_friend fr ON fr.user_id=t.user_id AND fr.friend_id=t.counterparty_user_id
                WHERE t.id=? AND t.user_id=?
                """, transactionId, userId);
        if (rows.isEmpty()) throw new BizException("收支记录不存在");
        return rows.get(0);
    }

    @Transactional
    public Map<String, Object> sendRedPacket(Long userId, Long conversationId, String packetType,
                                              Long targetUserId, long totalAmount, int count,
                                              String greeting, String paymentPassword) {
        int conversationType = requireMember(userId, conversationId);
        String type = normalizePacketType(conversationType, packetType);
        long redPacketLimit = walletAmountConfigService.getLimits().redPacketMaxCents();
        if (totalAmount <= 0 || totalAmount > redPacketLimit) {
            throw new BizException("单个红包金额须在0.01-" + WalletAmountConfigService.toYuanText(redPacketLimit) + "元之间");
        }
        if (conversationType == 1) count = 1;
        if (count < 1 || count > 100 || totalAmount < count) throw new BizException("红包个数或金额不合法");
        if ("EXCLUSIVE".equals(type)) {
            if (targetUserId == null || targetUserId.equals(userId)) throw new BizException("请选择专属红包领取人");
            requireConversationMember(conversationId, targetUserId);
            count = 1;
        }
        verifyAndDebit(userId, totalAmount, paymentPassword);
        String no = tradeNo("RP");
        jdbc.update("""
                INSERT INTO red_packet(packet_no,conversation_id,conversation_type,sender_id,packet_type,target_user_id,
                total_amount,total_count,greeting) VALUES(?,?,?,?,?,?,?,?,?)
                """, no, conversationId, conversationType, userId, type, targetUserId, totalAmount, count,
                StringUtils.hasText(greeting) ? greeting.trim() : "恭喜发财，大吉大利");
        addTransaction(no, userId, "OUT", "RED_PACKET", totalAmount, null, conversationId, "发红包");
        sendBusinessMessage(userId, conversationId, 7, Map.of(
                "businessNo", no, "packetType", type, "greeting",
                StringUtils.hasText(greeting) ? greeting.trim() : "恭喜发财，大吉大利",
                "totalCount", count, "status", "ACTIVE",
                "expiresAt", OffsetDateTime.now().plusHours(48)));
        return redPacketDetail(userId, no);
    }

    @Transactional
    public Map<String, Object> receiveRedPacket(Long userId, String packetNo) {
        Map<String, Object> p = one("""
                SELECT * FROM red_packet WHERE packet_no=? FOR UPDATE
                """, packetNo);
        long packetId = number(p.get("id"));
        long senderId = number(p.get("sender_id"));
        int conversationType = ((Number) p.get("conversation_type")).intValue();
        String packetType = String.valueOf(p.get("packet_type"));
        boolean groupPacketAllowsSenderReceive = conversationType == 2
                && ("NORMAL".equals(packetType) || "LUCKY".equals(packetType));
        if (senderId == userId && !groupPacketAllowsSenderReceive) {
            throw new BizException("不能领取自己发的红包");
        }
        requireConversationMember(number(p.get("conversation_id")), userId);
        if ("EXCLUSIVE".equals(p.get("packet_type")) && number(p.get("target_user_id")) != userId)
            throw new BizException("这是给指定成员的专属红包");
        if (!"ACTIVE".equals(p.get("status")) || toOffsetDateTime(p.get("expires_at")).isBefore(OffsetDateTime.now()))
            throw new BizException("红包已领完或已过期");
        Integer exists = jdbc.queryForObject("SELECT COUNT(*) FROM red_packet_receive WHERE packet_id=? AND user_id=?",
                Integer.class, packetId, userId);
        if (exists != null && exists > 0) return redPacketDetail(userId, packetNo);
        long total = number(p.get("total_amount")), received = number(p.get("received_amount"));
        int totalCount = ((Number)p.get("total_count")).intValue(), receivedCount = ((Number)p.get("received_count")).intValue();
        long remaining = total - received;
        int slots = totalCount - receivedCount;
        if (slots <= 0 || remaining <= 0) throw new BizException("红包已领完");
        long amount;
        if (slots == 1) amount = remaining;
        else if ("LUCKY".equals(p.get("packet_type"))) {
            long max = Math.max(1, Math.min(remaining - slots + 1, (remaining / slots) * 2));
            amount = 1 + java.util.concurrent.ThreadLocalRandom.current().nextLong(max);
        } else amount = remaining / slots;
        jdbc.update("INSERT INTO red_packet_receive(packet_id,user_id,amount) VALUES(?,?,?)", packetId, userId, amount);
        jdbc.update("UPDATE sys_user SET wallet_balance=wallet_balance+? WHERE id=?", amount, userId);
        String status = receivedCount + 1 >= totalCount ? "FINISHED" : "ACTIVE";
        jdbc.update("UPDATE red_packet SET received_amount=received_amount+?,received_count=received_count+1,status=? WHERE id=?",
                amount, status, packetId);
        addTransaction(packetNo, userId, "IN", "RED_PACKET", amount, senderId, number(p.get("conversation_id")), "领取红包");
        if ("FINISHED".equals(status)) updateBusinessMessageStatus(packetNo, "FINISHED");
        sendReceiptMessage("red_packet_received", userId, senderId, number(p.get("conversation_id")), packetNo);
        return redPacketDetail(userId, packetNo);
    }

    public Map<String, Object> redPacketDetail(Long userId, String packetNo) {
        Map<String, Object> p = one("""
                SELECT p.*,COALESCE(NULLIF(TRIM(fr.remark),''), u.nickname) sender_name
                FROM red_packet p
                JOIN sys_user u ON u.id=p.sender_id
                LEFT JOIN im_friend fr ON fr.user_id=? AND fr.friend_id=p.sender_id
                WHERE p.packet_no=?
                """, userId, packetNo);
        requireConversationMember(number(p.get("conversation_id")), userId);
        List<Map<String, Object>> receives = jdbc.queryForList("""
                SELECT r.user_id,COALESCE(NULLIF(TRIM(fr.remark),''), u.nickname) nickname,
                       u.avatar_url,r.amount,r.received_at
                FROM red_packet_receive r
                JOIN sys_user u ON u.id=r.user_id
                LEFT JOIN im_friend fr ON fr.user_id=? AND fr.friend_id=r.user_id
                WHERE r.packet_id=? ORDER BY r.received_at
                """, userId, p.get("id"));
        p.put("receives", receives);
        p.put("receivedByMe", receives.stream().anyMatch(r -> number(r.get("user_id")) == userId));
        return p;
    }

    public Map<String, Object> transferDetail(Long userId, String transferNo) {
        Map<String, Object> transfer = one("""
                SELECT t.*,
                       COALESCE(NULLIF(TRIM(fs.remark),''), s.nickname) sender_name,
                       COALESCE(NULLIF(TRIM(fr.remark),''), r.nickname) receiver_name
                FROM wallet_transfer t
                JOIN sys_user s ON s.id=t.sender_id
                JOIN sys_user r ON r.id=t.receiver_id
                LEFT JOIN im_friend fs ON fs.user_id=? AND fs.friend_id=t.sender_id
                LEFT JOIN im_friend fr ON fr.user_id=? AND fr.friend_id=t.receiver_id
                WHERE t.transfer_no=?
                """, userId, userId, transferNo);
        requireConversationMember(number(transfer.get("conversation_id")), userId);
        return transfer;
    }

    @Transactional
    public Map<String, Object> transfer(Long userId, Long conversationId, Long receiverId, long amount,
                                         String remark, String paymentPassword) {
        int conversationType = requireMember(userId, conversationId);
        if (receiverId == null || receiverId.equals(userId)) throw new BizException("请选择收款成员");
        requireConversationMember(conversationId, receiverId);
        long transferLimit = walletAmountConfigService.getLimits().transferMaxCents();
        if (amount <= 0 || amount > transferLimit) {
            throw new BizException("转账金额须在0.01-" + WalletAmountConfigService.toYuanText(transferLimit) + "元之间");
        }
        verifyAndDebit(userId, amount, paymentPassword);
        String no = tradeNo("TF");
        jdbc.update("""
                INSERT INTO wallet_transfer(transfer_no,conversation_id,conversation_type,sender_id,receiver_id,
                amount,remark,status) VALUES(?,?,?,?,?,?,?,'PENDING')
                """, no, conversationId, conversationType, userId, receiverId, amount, trim(remark, 128));
        addTransaction(no, userId, "OUT", "TRANSFER", amount, receiverId, conversationId, remark);
        sendBusinessMessage(userId, conversationId, 8, Map.of("businessNo", no, "amount", amount,
                "receiverId", receiverId, "remark", remark == null ? "" : remark, "status", "PENDING",
                "expiresAt", OffsetDateTime.now().plusHours(48)));
        return one("SELECT * FROM wallet_transfer WHERE transfer_no=?", no);
    }

    @Transactional
    public Map<String, Object> receiveTransfer(Long userId, String transferNo) {
        Map<String, Object> transfer = one("SELECT * FROM wallet_transfer WHERE transfer_no=? FOR UPDATE", transferNo);
        long receiverId = number(transfer.get("receiver_id"));
        if (receiverId != userId) throw new BizException("仅收款人可以领取该转账");
        requireConversationMember(number(transfer.get("conversation_id")), userId);
        String status = String.valueOf(transfer.get("status"));
        if ("RECEIVED".equals(status)) return transfer;
        if (transfer.get("expires_at") != null
                && !toOffsetDateTime(transfer.get("expires_at")).isAfter(OffsetDateTime.now())) {
            throw new BizException("该转账已过期，无法领取");
        }
        if (!"PENDING".equals(status)) throw new BizException("该转账当前无法领取");
        long amount = number(transfer.get("amount"));
        long senderId = number(transfer.get("sender_id"));
        jdbc.update("UPDATE sys_user SET wallet_balance=wallet_balance+? WHERE id=?", amount, userId);
        jdbc.update("UPDATE wallet_transfer SET status='RECEIVED',received_at=NOW() WHERE id=?", transfer.get("id"));
        addTransaction(transferNo, userId, "IN", "TRANSFER", amount, senderId,
                number(transfer.get("conversation_id")), String.valueOf(transfer.getOrDefault("remark", "")));
        updateBusinessMessageStatus(transferNo, "RECEIVED");
        sendReceiptMessage("transfer_received", userId, senderId, number(transfer.get("conversation_id")), transferNo);
        return one("SELECT * FROM wallet_transfer WHERE transfer_no=?", transferNo);
    }

    public Map<String, Object> adminRedPackets(Integer conversationType, String packetType,
                                                 String keyword, int page, int size) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        StringBuilder where = new StringBuilder(" WHERE (CAST(? AS INTEGER) IS NULL OR p.conversation_type=?) ");
        List<Object> args = new ArrayList<>();
        args.add(conversationType);
        args.add(conversationType);
        if (StringUtils.hasText(packetType)) {
            where.append(" AND p.packet_type=? ");
            args.add(packetType.trim());
        }
        if (StringUtils.hasText(keyword)) {
            where.append("""
                     AND (p.packet_no ILIKE ? OR s.nickname ILIKE ? OR CAST(p.sender_id AS TEXT) ILIKE ?
                          OR COALESCE(c.title,'') ILIKE ? OR CAST(p.conversation_id AS TEXT) ILIKE ?
                          OR COALESCE(rr.receiver_names,'') ILIKE ?)
                    """);
            String v = "%" + keyword.trim() + "%";
            for (int i = 0; i < 6; i++) args.add(v);
        }
        Long total = jdbc.queryForObject(
                """
                        SELECT COUNT(*) FROM red_packet p
                        JOIN sys_user s ON s.id=p.sender_id
                        LEFT JOIN im_conversation c ON c.id=p.conversation_id
                        LEFT JOIN LATERAL (
                            SELECT string_agg(
                                u.nickname || ' (' || r.user_id || ') ¥' ||
                                to_char(r.amount / 100.0, 'FM999999990.00'),
                                '、' ORDER BY r.received_at
                            ) AS receiver_names
                            FROM red_packet_receive r
                            JOIN sys_user u ON u.id=r.user_id
                            WHERE r.packet_id=p.id
                        ) rr ON TRUE
                        """ + where,
                Long.class,
                args.toArray());
        List<Object> listArgs = new ArrayList<>(args);
        listArgs.add(safeSize);
        listArgs.add((safePage - 1L) * safeSize);
        List<Map<String, Object>> list = jdbc.queryForList(
                """
                        SELECT p.*,s.nickname sender_name,t.nickname target_name,c.title conversation_title,
                               rr.receiver_names
                        FROM red_packet p JOIN sys_user s ON s.id=p.sender_id
                        LEFT JOIN sys_user t ON t.id=p.target_user_id LEFT JOIN im_conversation c ON c.id=p.conversation_id
                        LEFT JOIN LATERAL (
                            SELECT string_agg(
                                u.nickname || ' (' || r.user_id || ') ¥' ||
                                to_char(r.amount / 100.0, 'FM999999990.00'),
                                '、' ORDER BY r.received_at
                            ) AS receiver_names
                            FROM red_packet_receive r
                            JOIN sys_user u ON u.id=r.user_id
                            WHERE r.packet_id=p.id
                        ) rr ON TRUE
                        """ + where + " ORDER BY p.created_at DESC LIMIT ? OFFSET ?",
                listArgs.toArray());
        return pageResult(list, total == null ? 0 : total, safePage, safeSize);
    }

    public Map<String, Object> adminTransfers(Integer conversationType, String keyword, int page, int size) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        StringBuilder where = new StringBuilder(" WHERE (CAST(? AS INTEGER) IS NULL OR t.conversation_type=?) ");
        List<Object> args = new ArrayList<>();
        args.add(conversationType);
        args.add(conversationType);
        if (StringUtils.hasText(keyword)) {
            where.append("""
                     AND (t.transfer_no ILIKE ? OR s.nickname ILIKE ? OR r.nickname ILIKE ?
                          OR CAST(t.sender_id AS TEXT) ILIKE ? OR CAST(t.receiver_id AS TEXT) ILIKE ?
                          OR COALESCE(c.title,'') ILIKE ? OR CAST(t.conversation_id AS TEXT) ILIKE ?)
                    """);
            String v = "%" + keyword.trim() + "%";
            for (int i = 0; i < 7; i++) args.add(v);
        }
        Long total = jdbc.queryForObject(
                """
                        SELECT COUNT(*) FROM wallet_transfer t
                        JOIN sys_user s ON s.id=t.sender_id
                        JOIN sys_user r ON r.id=t.receiver_id
                        LEFT JOIN im_conversation c ON c.id=t.conversation_id
                        """ + where,
                Long.class,
                args.toArray());
        List<Object> listArgs = new ArrayList<>(args);
        listArgs.add(safeSize);
        listArgs.add((safePage - 1L) * safeSize);
        List<Map<String, Object>> list = jdbc.queryForList(
                """
                        SELECT t.*,s.nickname sender_name,r.nickname receiver_name,c.title conversation_title
                        FROM wallet_transfer t JOIN sys_user s ON s.id=t.sender_id JOIN sys_user r ON r.id=t.receiver_id
                        LEFT JOIN im_conversation c ON c.id=t.conversation_id
                        """ + where + " ORDER BY t.created_at DESC LIMIT ? OFFSET ?",
                listArgs.toArray());
        return pageResult(list, total == null ? 0 : total, safePage, safeSize);
    }

    public Map<String, Object> adminBalanceTransactions(Long userId, String type, String direction,
                                                          String keyword, int page, int size) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        StringBuilder where = new StringBuilder(" WHERE 1=1 ");
        List<Object> args = new ArrayList<>();
        if (userId != null) {
            where.append(" AND t.user_id=?");
            args.add(userId);
        }
        if (StringUtils.hasText(type)) {
            where.append(" AND t.trade_type=?");
            args.add(type.trim());
        }
        if (StringUtils.hasText(direction)) {
            where.append(" AND t.direction=?");
            args.add(direction.trim());
        }
        if (StringUtils.hasText(keyword)) {
            where.append("""
                     AND (u.nickname ILIKE ? OR u.phone ILIKE ? OR u.pulse_id ILIKE ?
                          OR t.trade_no ILIKE ? OR COALESCE(t.remark,'') ILIKE ?)
                    """);
            String value = "%" + keyword.trim() + "%";
            for (int i = 0; i < 5; i++) args.add(value);
        }
        Long total = jdbc.queryForObject(
                """
                        SELECT COUNT(*) FROM wallet_transaction t
                        JOIN sys_user u ON u.id=t.user_id
                        """ + where,
                Long.class,
                args.toArray());
        List<Object> listArgs = new ArrayList<>(args);
        listArgs.add(safeSize);
        listArgs.add((safePage - 1L) * safeSize);
        List<Map<String, Object>> list = jdbc.queryForList(
                """
                        SELECT t.id,t.trade_no,t.user_id,u.nickname,u.phone,u.pulse_id,t.direction,t.trade_type,
                               t.amount,t.balance_after,t.counterparty_user_id,cu.nickname AS counterparty_name,
                               t.conversation_id,t.remark,t.created_at
                        FROM wallet_transaction t
                        JOIN sys_user u ON u.id=t.user_id
                        LEFT JOIN sys_user cu ON cu.id=t.counterparty_user_id
                        """ + where + " ORDER BY t.created_at DESC LIMIT ? OFFSET ?",
                listArgs.toArray());
        return pageResult(list, total == null ? 0 : total, safePage, safeSize);
    }

    private Map<String, Object> pageResult(List<Map<String, Object>> list, long total, int page, int size) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("list", list);
        data.put("total", total);
        data.put("page", page);
        data.put("size", size);
        return data;
    }

    /**
     * 管理后台人工调账。amount 始终为正数，direction 为 CREDIT（充值）或 DEBIT（扣款）。
     */
    @Transactional
    public Map<String, Object> adminAdjustBalance(Long adminId, Long userId, String direction,
                                                  long amount, String remark) {
        if (amount <= 0 || amount > 100_000_000_00L) {
            throw new BizException("调整金额须大于0且不超过1亿元");
        }
        String action = direction == null ? "" : direction.trim().toUpperCase(Locale.ROOT);
        if (!Set.of("CREDIT", "DEBIT").contains(action)) {
            throw new BizException("余额操作类型不正确");
        }
        Map<String, Object> user = one(
                "SELECT id,nickname,wallet_balance FROM sys_user WHERE id=? FOR UPDATE", userId);
        long before = number(user.get("wallet_balance"));
        if ("DEBIT".equals(action) && before < amount) {
            throw new BizException("用户钱包余额不足，无法扣款");
        }
        long after = "CREDIT".equals(action) ? before + amount : before - amount;
        jdbc.update("UPDATE sys_user SET wallet_balance=?,updated_at=NOW() WHERE id=?", after, userId);
        String no = tradeNo("AD");
        String note = StringUtils.hasText(remark)
                ? trim(remark, 200)
                : ("CREDIT".equals(action) ? "后台充值" : "后台扣款");
        jdbc.update("""
                INSERT INTO wallet_transaction(trade_no,user_id,direction,trade_type,amount,balance_after,remark)
                VALUES(?,?,?,?,?,?,?)
                """, no, userId, "CREDIT".equals(action) ? "IN" : "OUT",
                "ADMIN_ADJUST", amount, after, note + "（管理员ID " + adminId + "）");
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("userId", userId);
        result.put("nickname", user.get("nickname"));
        result.put("direction", action);
        result.put("amount", amount);
        result.put("balanceBefore", before);
        result.put("balanceAfter", after);
        result.put("tradeNo", no);
        return result;
    }

    private void verifyAndDebit(Long userId, long amount, String password) {
        Map<String, Object> user = one("SELECT wallet_balance,payment_password_hash FROM sys_user WHERE id=? FOR UPDATE", userId);
        String hash = (String) user.get("payment_password_hash");
        if (!StringUtils.hasText(hash)) throw new BizException("请先设置支付密码");
        if (!passwordEncoder.matches(password == null ? "" : password, hash)) throw new BizException("支付密码错误");
        if (number(user.get("wallet_balance")) < amount) throw new BizException("钱包余额不足");
        jdbc.update("UPDATE sys_user SET wallet_balance=wallet_balance-? WHERE id=?", amount, userId);
    }

    private void addTransaction(String no, Long userId, String direction, String type, long amount,
                                Long counterparty, Long conversationId, String remark) {
        jdbc.update("""
                INSERT INTO wallet_transaction(trade_no,user_id,direction,trade_type,amount,balance_after,
                counterparty_user_id,conversation_id,remark)
                SELECT ?,?,?,?,?,wallet_balance,?,?,? FROM sys_user WHERE id=?
                """, no, userId, direction, type, amount, counterparty, conversationId, trim(remark, 256), userId);
    }

    private int requireMember(Long userId, Long conversationId) {
        Integer type = jdbc.queryForObject("""
                SELECT c.type FROM im_conversation c JOIN im_conversation_member m ON m.conversation_id=c.id
                WHERE c.id=? AND m.user_id=?
                """, Integer.class, conversationId, userId);
        if (type == null) throw new BizException("您不在该会话中");
        return type;
    }
    private void requireConversationMember(Long conversationId, Long userId) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM im_conversation_member WHERE conversation_id=? AND user_id=?",
                Integer.class, conversationId, userId);
        if (n == null || n == 0) throw new BizException("指定用户不是会话成员");
    }
    private String normalizePacketType(int conversationType, String type) {
        if (conversationType == 1) return "PRIVATE";
        String value = type == null ? "LUCKY" : type.toUpperCase(Locale.ROOT);
        if (!Set.of("NORMAL", "LUCKY", "EXCLUSIVE").contains(value)) throw new BizException("红包类型不支持");
        return value;
    }
    private void sendBusinessMessage(Long userId, Long conversationId, int msgType, Map<String,Object> payload) {
        try {
            socialService.sendMessage(userId, conversationId, null, objectMapper.writeValueAsString(payload),
                    UUID.randomUUID().toString(), null, msgType);
        } catch (BizException e) { throw e; }
        catch (Exception e) { throw new BizException("发送交易消息失败"); }
    }
    private void updateBusinessMessageStatus(String businessNo, String status) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT msg_id, conversation_id, msg_type
                FROM im_message
                WHERE msg_type IN (7,8) AND content::jsonb->>'businessNo'=?
                """, businessNo);
        if (rows.isEmpty()) return;
        jdbc.update("""
                UPDATE im_message
                SET content=jsonb_set(content::jsonb,'{status}',to_jsonb(?::text),true)::text
                WHERE msg_type IN (7,8) AND content::jsonb->>'businessNo'=?
                """, status, businessNo);
        for (Map<String, Object> row : rows) {
            publishBusinessStatusPush(
                    number(row.get("conversation_id")),
                    String.valueOf(row.get("msg_id")),
                    ((Number) row.get("msg_type")).intValue(),
                    businessNo,
                    status);
        }
    }

    /** 红包/转账状态变更（领取、领完、过期退款）实时推送给会话内所有成员 */
    private void publishBusinessStatusPush(
            Long conversationId, String msgId, int msgType, String businessNo, String status) {
        try {
            List<Long> memberIds = jdbc.queryForList(
                    "SELECT user_id FROM im_conversation_member WHERE conversation_id=?",
                    Long.class, conversationId);
            for (Long toUserId : memberIds) {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("event", "business_status");
                payload.put("cmd", "BUSINESS_STATUS");
                payload.put("conversationId", conversationId);
                payload.put("msgId", msgId);
                payload.put("id", msgId);
                payload.put("msgType", msgType);
                payload.put("businessNo", businessNo);
                payload.put("status", status);
                payload.put("toUserId", toUserId);
                payload.put("sendTime", System.currentTimeMillis());
                redis.convertAndSend(RedisKeys.IM_PUSH_CHANNEL,
                        objectMapper.writeValueAsString(payload));
            }
        } catch (Exception e) {
            log.warn("publish business status push failed: {}", e.getMessage());
        }
    }
    private void sendReceiptMessage(String kind, Long actorId, Long ownerId, Long conversationId, String businessNo) {
        Map<String, Object> names = jdbc.queryForMap("""
                SELECT COALESCE(NULLIF(TRIM(fa.remark),''), a.nickname) AS actor_name,
                       o.nickname AS owner_name
                FROM sys_user a
                JOIN sys_user o ON o.id=?
                LEFT JOIN im_friend fa ON fa.user_id=o.id AND fa.friend_id=a.id
                WHERE a.id=?
                """, ownerId, actorId);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("kind", kind);
        payload.put("actorId", actorId);
        payload.put("actorName", names.get("actor_name"));
        payload.put("ownerId", ownerId);
        payload.put("ownerName", names.get("owner_name"));
        appendBusinessMessageLink(payload, businessNo, conversationId);
        try {
            socialService.sendMessage(actorId, conversationId, null,
                    objectMapper.writeValueAsString(payload),
                    UUID.randomUUID().toString(), null, 9);
        } catch (BizException e) {
            throw e;
        } catch (Exception e) {
            throw new BizException("发送交易提示失败");
        }
    }
    @Scheduled(fixedDelay = 60_000)
    @Transactional
    public void expirePendingPayments() {
        List<Map<String,Object>> packets = jdbc.queryForList("""
                SELECT * FROM red_packet WHERE status='ACTIVE' AND expires_at<=NOW()
                FOR UPDATE SKIP LOCKED LIMIT 100
                """);
        for (Map<String,Object> p : packets) {
            long refund = number(p.get("total_amount")) - number(p.get("received_amount"));
            long sender = number(p.get("sender_id"));
            String no = String.valueOf(p.get("packet_no"));
            if (refund > 0) {
                jdbc.update("UPDATE sys_user SET wallet_balance=wallet_balance+? WHERE id=?", refund, sender);
                addTransaction(no + "-RF", sender, "IN", "REFUND", refund, null,
                        number(p.get("conversation_id")), "红包过期退款");
            }
            jdbc.update("UPDATE red_packet SET status='EXPIRED' WHERE id=?", p.get("id"));
            updateBusinessMessageStatus(no, "EXPIRED");
            sendExpiryMessage(sender, number(p.get("conversation_id")), "red_packet_expired", refund, no);
        }
        List<Map<String,Object>> transfers = jdbc.queryForList("""
                SELECT * FROM wallet_transfer WHERE status='PENDING' AND expires_at<=NOW()
                FOR UPDATE SKIP LOCKED LIMIT 100
                """);
        for (Map<String,Object> t : transfers) {
            long amount = number(t.get("amount")), sender = number(t.get("sender_id"));
            String no = String.valueOf(t.get("transfer_no"));
            jdbc.update("UPDATE sys_user SET wallet_balance=wallet_balance+? WHERE id=?", amount, sender);
            addTransaction(no + "-RF", sender, "IN", "REFUND", amount,
                    number(t.get("receiver_id")), number(t.get("conversation_id")), "转账过期退款");
            jdbc.update("UPDATE wallet_transfer SET status='EXPIRED' WHERE id=?", t.get("id"));
            updateBusinessMessageStatus(no, "EXPIRED");
            sendExpiryMessage(sender, number(t.get("conversation_id")), "transfer_expired", amount, no);
        }
    }

    private void sendExpiryMessage(Long senderId, Long conversationId, String kind, long refund, String businessNo) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("kind", kind);
            payload.put("refundAmount", refund);
            appendBusinessMessageLink(payload, businessNo, conversationId);
            socialService.sendMessage(senderId, conversationId, null,
                    objectMapper.writeValueAsString(payload),
                    UUID.randomUUID().toString(), null, 9);
        } catch (Exception ignored) {
            // Refund and status are authoritative; notification can be retried by the next refresh.
        }
    }

    /** 系统提示携带原红包/转账消息，客户端可以从历史窗口准确回跳。 */
    private void appendBusinessMessageLink(Map<String, Object> payload, String businessNo, Long conversationId) {
        if (!StringUtils.hasText(businessNo)) return;
        payload.put("businessNo", businessNo);
        List<String> ids = jdbc.queryForList(
                "SELECT msg_id FROM im_message WHERE conversation_id=? AND msg_type IN (7,8) " +
                        "AND content::jsonb->>'businessNo'=? ORDER BY send_time ASC NULLS LAST, id ASC LIMIT 1",
                String.class, conversationId, businessNo);
        if (!ids.isEmpty() && StringUtils.hasText(ids.get(0))) {
            payload.put("sourceMsgId", ids.get(0));
        }
    }

    private Map<String,Object> one(String sql, Object... args) {
        List<Map<String,Object>> rows = jdbc.queryForList(sql, args);
        if (rows.isEmpty()) throw new BizException("记录不存在");
        return new LinkedHashMap<>(rows.get(0));
    }
    private long number(Object value) { return value == null ? 0 : ((Number)value).longValue(); }
    private OffsetDateTime toOffsetDateTime(Object value) {
        if (value instanceof OffsetDateTime time) return time;
        if (value instanceof java.sql.Timestamp timestamp) {
            return timestamp.toInstant().atOffset(java.time.ZoneOffset.UTC);
        }
        return OffsetDateTime.parse(String.valueOf(value));
    }
    private String tradeNo(String prefix) { return prefix + System.currentTimeMillis() + UUID.randomUUID().toString().substring(0,8).toUpperCase(); }
    private String trim(String text, int len) { return text == null ? null : text.trim().substring(0, Math.min(text.trim().length(), len)); }
}
