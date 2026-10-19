package com.pulse.api.controller;

import com.pulse.api.security.AuthContext;
import com.pulse.api.service.CallRingtoneService;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class CallRingtoneController {
    private final CallRingtoneService callRingtoneService;

    /** 启用中的铃声目录 */
    @GetMapping("/config/call-ringtones")
    public R<Map<String, Object>> catalog() {
        List<Map<String, Object>> list = callRingtoneService.listEnabledForClient();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("list", list);
        return R.ok(result);
    }

    /** 当前用户生效铃声（兼容旧接口） */
    @GetMapping("/config/call-ringtone")
    public R<Map<String, Object>> mineEffective() {
        return R.ok(callRingtoneService.getEffectiveRingtone(AuthContext.currentUserId()));
    }

    @GetMapping("/user/ringtone")
    public R<Map<String, Object>> myRingtone() {
        return R.ok(callRingtoneService.getMyRingtone(AuthContext.currentUserId()));
    }

    @PutMapping("/user/ringtone")
    public R<Map<String, Object>> setMyRingtone(@RequestBody Map<String, Object> body) {
        Long ringtoneId = null;
        Object raw = body.get("ringtoneId");
        if (raw != null && String.valueOf(raw).trim().length() > 0 && !"null".equalsIgnoreCase(String.valueOf(raw))) {
            ringtoneId = Long.valueOf(String.valueOf(raw).trim());
        }
        return R.ok(callRingtoneService.setMyRingtone(AuthContext.currentUserId(), ringtoneId));
    }

    /** 主叫获取对方铃声 */
    @GetMapping("/users/{userId}/ringtone")
    public R<Map<String, Object>> peerRingtone(@PathVariable long userId) {
        return R.ok(callRingtoneService.getUserEffectiveRingtone(userId));
    }
}
