package com.nvu.operacional;

public final class GtoCaptureHealthPolicyTest {
    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static boolean healthy(
        boolean gtoForeground,
        boolean analysisPaused,
        boolean stabilityReady,
        long now,
        long lastFrame,
        long lastAnalyzed
    ) {
        return GtoCaptureHealthPolicy.isHealthy(
            true,
            true,
            true,
            true,
            true,
            gtoForeground,
            analysisPaused,
            stabilityReady,
            now,
            lastFrame,
            lastAnalyzed
        );
    }

    public static void main(String[] args) {
        long now = 10_000L;
        require(!healthy(false, false, false, now, 9_900L, 9_900L), "pré-pronto não saudável");
        require(!healthy(true, false, false, now, 9_900L, 9_900L), "estabilidade não pronta não saudável");
        require(!healthy(true, true, true, now, 9_900L, 9_900L), "análise pausada não saudável");
        require(!healthy(true, false, true, now, 7_000L, 9_900L), "frame stale não saudável");
        require(!healthy(true, false, true, now, 9_900L, 6_000L), "análise stale não saudável");
        require(healthy(true, false, true, now, 9_900L, 9_900L), "GTO_READY com frames recentes saudável");
        require(GtoCaptureHealthPolicy.isTransportHealthy(
            true, true, true, true, true, now, 9_900L, 9_900L
        ), "transporte recente deve ser saudável sem depender de foreground");
        require(GtoCaptureHealthPolicy.isTransportHealthy(
            true, true, true, true, true, now, 9_900L, 9_900L
        ), "transporte recente deve permanecer saudável durante geometria contextual stale");
        System.out.println("PASS GtoCaptureHealthPolicy: transporte separado de foreground e estabilidade de ação");
    }
}
