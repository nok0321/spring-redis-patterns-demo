package com.example.cache.controller;

import com.example.cache.service.TransactionalLockService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.redisson.api.RTransaction;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Tag(name = "Transaction", description = "Saga パターン・補償トランザクションのデモ実行")
@RestController
@RequestMapping("/api/transaction")
public class TransactionController {

    private static final Logger logger = LoggerFactory.getLogger(TransactionController.class);

    private final TransactionalLockService transactionalLockService;

    public TransactionController(TransactionalLockService transactionalLockService) {
        this.transactionalLockService = transactionalLockService;
    }

    record SagaStep(String name, String status, long durationMs, String detail) {}

    // ----------------------------------------------------------------
    // Feature 7: Saga 正常実行
    // ----------------------------------------------------------------
    @Operation(summary = "Saga 正常実行", description = "3ステップの Saga トランザクションを実行する。全ステップ成功で overallStatus=SUCCESS")
    @ApiResponse(responseCode = "200", description = "実行完了（成功・失敗ともに 200 で返却し overallStatus で判断）")
    @PostMapping("/saga")
    public ResponseEntity<Map<String, Object>> runSaga() {
        List<SagaStep> steps = new ArrayList<>();

        var result = transactionalLockService.executeWithCompensation(
            (RTransaction tx) -> {
                // ステップ1: key1 に書き込む
                long t0 = System.currentTimeMillis();
                tx.<String>getBucket("saga:step1").set("done-" + t0);
                steps.add(new SagaStep("ステップ1: key1 書き込み", "SUCCESS",
                        System.currentTimeMillis() - t0, "saga:step1 = done-" + t0));

                // ステップ2: key2 に書き込む
                long t1 = System.currentTimeMillis();
                tx.<String>getBucket("saga:step2").set("done-" + t1);
                steps.add(new SagaStep("ステップ2: key2 書き込み", "SUCCESS",
                        System.currentTimeMillis() - t1, "saga:step2 = done-" + t1));

                // ステップ3: 完了
                long t2 = System.currentTimeMillis();
                tx.<String>getBucket("saga:step3").set("completed-" + t2);
                steps.add(new SagaStep("ステップ3: 完了マーク", "SUCCESS",
                        System.currentTimeMillis() - t2, "saga:step3 = completed-" + t2));

                return "SUCCESS";
            },
            (_tx) -> null // 正常完了なので補償処理は呼ばれない
        );

        return ResponseEntity.ok(Map.of(
                "steps", steps,
                "overallStatus", result.isPresent() ? "SUCCESS" : "FAILED",
                "timestamp", System.currentTimeMillis()));
    }

    // ----------------------------------------------------------------
    // Feature 7: Saga 失敗→補償実行
    // ----------------------------------------------------------------
    @Operation(summary = "Saga 失敗→補償実行", description = "ステップ2で意図的に失敗させ、補償トランザクション（ロールバック）が実行されることを確認するデモ")
    @ApiResponse(responseCode = "200", description = "実行完了（overallStatus=COMPENSATED が成功ケース）")
    @PostMapping("/saga-fail")
    public ResponseEntity<Map<String, Object>> runSagaFail() {
        List<SagaStep> steps = new ArrayList<>();
        List<SagaStep> compensationSteps = new ArrayList<>();

        var outcome = transactionalLockService.executeWithCompensation(
            (RTransaction tx) -> {
                // ステップ1: key1 に書き込む（成功）
                long t0 = System.currentTimeMillis();
                tx.<String>getBucket("saga:step1").set("done-" + t0);
                steps.add(new SagaStep("ステップ1: key1 書き込み", "SUCCESS",
                        System.currentTimeMillis() - t0, "saga:step1 = done-" + t0));

                // ステップ2: 意図的に例外をスロー
                long t1 = System.currentTimeMillis();
                steps.add(new SagaStep("ステップ2: 失敗シミュレーション", "FAILED",
                        System.currentTimeMillis() - t1, "意図的な例外をスローしました"));
                throw new RuntimeException("ステップ2で障害が発生しました（デモ用）");
            },
            (RTransaction tx) -> {
                // 補償処理: key1 を削除してロールバック
                long tc = System.currentTimeMillis();
                tx.<String>getBucket("saga:step1").delete();
                compensationSteps.add(new SagaStep("補償: key1 ロールバック", "COMPENSATED",
                        System.currentTimeMillis() - tc, "saga:step1 を削除しました"));
                return null;
            }
        );

        // Optional.empty() means main action failed and compensation was invoked by the service
        String overallStatus = outcome.isEmpty() ? "COMPENSATED" : "COMPENSATION_FAILED";
        return ResponseEntity.ok(Map.of(
                "steps", steps,
                "compensationSteps", compensationSteps,
                "overallStatus", overallStatus,
                "timestamp", System.currentTimeMillis()));
    }
}
