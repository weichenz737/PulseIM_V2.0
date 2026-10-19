package com.pulse.api.controller;

import com.pulse.api.security.AuthContext;
import com.pulse.api.service.WalletService;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/wallet")
@RequiredArgsConstructor
public class WalletController {
    private final WalletService walletService;

    @GetMapping public R<Map<String,Object>> summary() { return R.ok(walletService.summary(AuthContext.currentUserId())); }
    @GetMapping("/config")
    public R<Map<String, Object>> config() {
        return R.ok(walletService.amountConfig());
    }
    @PutMapping("/payment-password")
    public R<Void> paymentPassword(@RequestBody Map<String,Object> body) {
        walletService.setPaymentPassword(AuthContext.currentUserId(), str(body,"password"), str(body,"oldPassword"));
        return R.ok();
    }
    @PostMapping("/payment-password/reset")
    public R<Void> resetPaymentPassword(@RequestBody Map<String,Object> body) {
        walletService.resetPaymentPasswordBySms(
                AuthContext.currentUserId(), str(body,"code"), str(body,"password"));
        return R.ok();
    }
    @GetMapping("/transactions")
    public R<List<Map<String,Object>>> transactions(@RequestParam(required=false) String type,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to) {
        return R.ok(walletService.transactions(AuthContext.currentUserId(), type, from, to));
    }
    @GetMapping("/transactions/{id}")
    public R<Map<String,Object>> transactionDetail(@PathVariable Long id) {
        return R.ok(walletService.transactionDetail(AuthContext.currentUserId(), id));
    }
    @PostMapping("/red-packets")
    public R<Map<String,Object>> redPacket(@RequestBody Map<String,Object> b) {
        return R.ok(walletService.sendRedPacket(AuthContext.currentUserId(), lng(b,"conversationId"), str(b,"packetType"),
                nullableLong(b.get("targetUserId")), lng(b,"totalAmount"), integer(b,"count",1),
                str(b,"greeting"), str(b,"paymentPassword")));
    }
    @PostMapping("/red-packets/{no}/receive")
    public R<Map<String,Object>> receive(@PathVariable String no) {
        return R.ok(walletService.receiveRedPacket(AuthContext.currentUserId(), no));
    }
    @GetMapping("/red-packets/{no}")
    public R<Map<String,Object>> detail(@PathVariable String no) {
        return R.ok(walletService.redPacketDetail(AuthContext.currentUserId(), no));
    }
    @PostMapping("/transfers")
    public R<Map<String,Object>> transfer(@RequestBody Map<String,Object> b) {
        return R.ok(walletService.transfer(AuthContext.currentUserId(), lng(b,"conversationId"),
                lng(b,"receiverId"), lng(b,"amount"), str(b,"remark"), str(b,"paymentPassword")));
    }
    @PostMapping("/transfers/{no}/receive")
    public R<Map<String,Object>> receiveTransfer(@PathVariable String no) {
        return R.ok(walletService.receiveTransfer(AuthContext.currentUserId(), no));
    }
    @GetMapping("/transfers/{no}")
    public R<Map<String,Object>> transferDetail(@PathVariable String no) {
        return R.ok(walletService.transferDetail(AuthContext.currentUserId(), no));
    }
    private static String str(Map<String,Object> b,String k){ return b.get(k)==null ? null : String.valueOf(b.get(k)); }
    private static long lng(Map<String,Object> b,String k){ return Long.parseLong(String.valueOf(b.get(k))); }
    private static int integer(Map<String,Object>b,String k,int d){ return b.get(k)==null?d:Integer.parseInt(String.valueOf(b.get(k))); }
    private static Long nullableLong(Object v){ return v==null||String.valueOf(v).isBlank()?null:Long.valueOf(String.valueOf(v)); }
}
