package com.pulse.api.controller;

import com.pulse.api.security.AuthContext;
import com.pulse.api.service.HelpFeedbackService;
import com.pulse.common.result.R;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/help")
@RequiredArgsConstructor
public class HelpFeedbackController {
    private final HelpFeedbackService service;

    @GetMapping({"/faqs", "/questions"})
    public R<List<Map<String, Object>>> faqs() { return R.ok(service.publicFaqs()); }

    @GetMapping({"/faqs/{id}", "/questions/{id}"})
    public R<Map<String, Object>> faq(@PathVariable Long id) { return R.ok(service.publicFaq(id)); }

    @PostMapping("/feedback")
    public R<Map<String, Object>> feedback(@RequestBody FeedbackReq req) {
        return R.ok(service.createFeedback(AuthContext.currentUserId(), req.content, req.imageUrls));
    }

    @Data
    public static class FeedbackReq {
        private String content;
        private List<String> imageUrls;
    }
}
