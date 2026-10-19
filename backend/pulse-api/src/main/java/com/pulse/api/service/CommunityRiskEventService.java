package com.pulse.api.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** 风险事件单独提交，确保命中敏感词后原有业务回滚时仍保留统计记录。 */
@Service
@RequiredArgsConstructor
public class CommunityRiskEventService {
    private final JdbcTemplate jdbcTemplate;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(long communityId, long userId, Long targetId, String eventType) {
        jdbcTemplate.update(
                "INSERT INTO community_risk_event(community_id,user_id,target_id,event_type) VALUES(?,?,?,?)",
                communityId, userId, targetId, eventType);
    }
}
