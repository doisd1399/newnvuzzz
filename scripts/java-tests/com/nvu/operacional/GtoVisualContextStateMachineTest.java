package com.nvu.operacional;

public final class GtoVisualContextStateMachineTest {
    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    public static void main(String[] args) {
        GtoVisualContextStateMachine machine = new GtoVisualContextStateMachine();
        GtoVisualContextStateMachine.Snapshot first = machine.observe(
            7L, GtoVisualContextStateMachine.FREIGHT_LIST, "LIST-A", 1000L
        );
        require(!first.confirmed && first.consecutiveFrames == 1, "primeiro frame deve ser candidato");
        GtoVisualContextStateMachine.Snapshot second = machine.observe(
            7L, GtoVisualContextStateMachine.FREIGHT_LIST, "LIST-A", 1300L
        );
        require(!second.confirmed && second.consecutiveFrames == 2, "segundo frame ainda não confirma");
        GtoVisualContextStateMachine.Snapshot third = machine.observe(
            7L, GtoVisualContextStateMachine.FREIGHT_LIST, "LIST-A", 1600L
        );
        require(third.confirmed && third.becameConfirmed, "terceiro frame deve confirmar a lista");
        require(machine.isConfirmedFor(7L, GtoVisualContextStateMachine.FREIGHT_LIST), "contexto deve pertencer à geração atual");

        GtoVisualContextStateMachine.Snapshot stale = machine.observe(
            6L, GtoVisualContextStateMachine.RESULT, "RESULT-A", 1700L
        );
        require(!stale.confirmed && stale.generation == 6L, "geração antiga não pode reutilizar contexto anterior");

        GtoVisualContextStateMachine.Snapshot pause1 = machine.observe(
            8L, GtoVisualContextStateMachine.PAUSE, "PAUSE-COD", 2000L
        );
        machine.observe(8L, GtoVisualContextStateMachine.PAUSE, "PAUSE-COD", 2200L);
        GtoVisualContextStateMachine.Snapshot pause3 = machine.observe(
            8L, GtoVisualContextStateMachine.PAUSE, "PAUSE-COD", 2400L
        );
        require(!pause1.confirmed && pause3.confirmed, "pause deve confirmar por frames atuais");

        GtoVisualContextStateMachine.Snapshot gap = machine.observe(
            8L, GtoVisualContextStateMachine.PAUSE, "PAUSE-COD", 4000L
        );
        require(!gap.confirmed || gap.state.equals(GtoVisualContextStateMachine.PAUSE), "gap não pode mudar estado para outra tela");
        System.out.println("GtoVisualContextStateMachineTest: PASS");
    }
}
