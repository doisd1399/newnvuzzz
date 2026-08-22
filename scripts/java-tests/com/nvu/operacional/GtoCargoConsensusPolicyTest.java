package com.nvu.operacional;

public final class GtoCargoConsensusPolicyTest {
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        System.out.println("PASS " + message);
    }

    public static void main(String[] args) {
        check(
            GtoCargoConsensusPolicy.nextReadCount("", 0, "Bebidas") == 1,
            "primeira leitura da carga permanece pendente"
        );
        check(
            GtoCargoConsensusPolicy.nextReadCount("Bebidas", 1, "Bebidas") == 2,
            "segunda leitura idêntica confirma a carga"
        );
        check(
            GtoCargoConsensusPolicy.nextReadCount("Bebtidas", 1, "Bebidas") == 1,
            "grafias divergentes não são tratadas como concordância"
        );
        check(
            !GtoCargoConsensusPolicy.confirmed(1)
                && GtoCargoConsensusPolicy.confirmed(2),
            "somente duas leituras atingem o estado confirmado"
        );
        check(
            GtoCargoConsensusPolicy.sameCandidate("Bebidas", "  bebidas  "),
            "normalização conservadora ignora apenas caixa e espaços"
        );
        check(
            !GtoCargoConsensusPolicy.sameCandidate("Bebtidas", "Bebidas"),
            "normalização não aplica correção fuzzy silenciosa"
        );
    }
}
