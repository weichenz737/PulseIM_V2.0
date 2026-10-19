package com.pulse.api.controller;

import com.pulse.api.service.HelpFeedbackService;
import com.pulse.common.result.R;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminHelpFeedbackController {
    private final HelpFeedbackService service;

    @GetMapping("/help-faqs")
    public R<Map<String, Object>> faqs(@RequestParam(defaultValue = "1") int page,
                                       @RequestParam(defaultValue = "20") int size,
                                       @RequestParam(required = false) String keyword) {
        return R.ok(service.adminFaqs(page, size, keyword));
    }

    @PostMapping("/help-faqs")
    public R<Map<String, Object>> createFaq(@RequestBody FaqReq req) {
        return R.ok(service.saveFaq(null, req.title, req.answer, req.sortOrder, req.enabled));
    }

    @PutMapping("/help-faqs/{id}")
    public R<Map<String, Object>> updateFaq(@PathVariable Long id, @RequestBody FaqReq req) {
        return R.ok(service.saveFaq(id, req.title, req.answer, req.sortOrder, req.enabled));
    }

    @DeleteMapping("/help-faqs/{id}")
    public R<Void> deleteFaq(@PathVariable Long id) {
        service.deleteFaq(id);
        return R.ok();
    }

    @GetMapping("/user-feedback")
    public R<Map<String, Object>> feedback(@RequestParam(defaultValue = "1") int page,
                                           @RequestParam(defaultValue = "20") int size,
                                           @RequestParam(required = false) String status,
                                           @RequestParam(required = false) String keyword) {
        return R.ok(service.adminFeedback(page, size, status, keyword));
    }

    @GetMapping("/user-feedback/{id}")
    public R<Map<String, Object>> feedbackDetail(@PathVariable Long id) {
        return R.ok(service.feedbackDetail(id));
    }

    @PutMapping("/user-feedback/{id}")
    public R<Map<String, Object>> updateFeedback(@PathVariable Long id, @RequestBody FeedbackReq req) {
        return R.ok(service.updateFeedback(id, req.status, req.reply));
    }

    @Data
    public static class FaqReq {
        private String title;
        private String answer;
        private Integer sortOrder;
        private Boolean enabled;
    }

    @Data
    public static class FeedbackReq {
        private String status;
        private String reply;
    }
}
