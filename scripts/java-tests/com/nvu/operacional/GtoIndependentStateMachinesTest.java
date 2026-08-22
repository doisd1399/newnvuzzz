package com.nvu.operacional;

public final class GtoIndependentStateMachinesTest {
    public static void main(String[] args) {
        long now = 10_000L;
        GtoTransportStateMachine transport = new GtoTransportStateMachine();
        GtoTransportStateMachine.Snapshot alive = transport.observe(
            7L, true, true, true, true, true,
            now - 100L, now - 50L, false, now
        );
        if (!alive.healthy || !GtoTransportStateMachine.ANALYSIS_RUNNING.equals(alive.state)) {
            throw new AssertionError("transporte vivo não foi reconhecido");
        }

        GtoGeometryStateMachine geometry = new GtoGeometryStateMachine();
        GtoGeometryStateMachine.Snapshot portrait = geometry.observe(7L, 1220, 2712, now);
        if (!portrait.valid) throw new AssertionError("portrait válido foi rejeitado");

        GtoActionStateMachine actions = new GtoActionStateMachine();
        GtoActionStateMachine.Snapshot blocked = actions.derive(
            7L, 7L, alive.healthy, false, portrait.valid, false, false, now
        );
        if (blocked.armed || !"SCREEN_CONTEXT_NOT_CONFIRMED".equals(blocked.reason)) {
            throw new AssertionError("ação armada sem contexto visual");
        }
        GtoActionStateMachine.Snapshot armed = actions.derive(
            7L, 7L, alive.healthy, true, portrait.valid, false, false, now + 1L
        );
        if (!armed.armed) throw new AssertionError("ação não armada com máquinas confirmadas");

        GtoTransportStateMachine.Snapshot stale = transport.observe(
            7L, true, true, true, true, true,
            now - 5_000L, now - 5_000L, false, now
        );
        if (stale.healthy || !GtoTransportStateMachine.FRAME_STALE.equals(stale.state)) {
            throw new AssertionError("frame stale não derrubou transporte");
        }
        GtoActionStateMachine.Snapshot oldGeneration = actions.derive(
            8L, 7L, alive.healthy, true, portrait.valid, false, false, now + 2L
        );
        if (oldGeneration.armed) throw new AssertionError("geração antiga armada");
        System.out.println("GtoIndependentStateMachinesTest: PASS");
    }
}
