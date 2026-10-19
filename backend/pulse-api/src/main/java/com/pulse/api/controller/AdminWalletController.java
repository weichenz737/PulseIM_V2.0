package com.pulse.api.controller;

import com.pulse.api.service.WalletService;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/admin/wallet")
@RequiredArgsConstructor
public class AdminWalletController {
    private final WalletService walletService;

    @GetMapping("/red-packets")
    public R<Map<String, Object>> redPackets(
            @RequestParam(required = false) Integer conversationType,
            @RequestParam(required = false) String packetType,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return R.ok(walletService.adminRedPackets(conversationType, packetType, keyword, page, size));
    }

    @GetMapping("/transfers")
    public R<Map<String, Object>> transfers(
            @RequestParam(required = false) Integer conversationType,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return R.ok(walletService.adminTransfers(conversationType, keyword, page, size));
    }

    @GetMapping("/transactions")
    public R<Map<String, Object>> transactions(
            @RequestParam(required = false) Long userId,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String direction,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return R.ok(walletService.adminBalanceTransactions(userId, type, direction, keyword, page, size));
    }
}
