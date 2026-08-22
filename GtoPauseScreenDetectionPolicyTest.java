package com.nvu.operacional;

public final class GtoPauseScreenDetectionPolicyTest {
    private static void require(String actual, String expected, String label) {
        if (!expected.equals(actual)) {
            throw new AssertionError(label + ": expected=" + expected + " actual=" + actual);
        }
    }

    public static void main(String[] args) {
        require(
            GtoPauseScreenDetectionPolicy.valueAfterLabel("Origem: Cooper Log – Cruz do Oeste", "origem"),
            "Cooper Log – Cruz do Oeste",
            "raw origin preserves en dash"
        );
        require(
            GtoPauseLocationParser.extractAfterLastSeparator(
                GtoPauseScreenDetectionPolicy.valueAfterLabel("Origem: Cooper Log – Cruz do Oeste", "origem")
            ),
            "Cruz do Oeste",
            "origin local from exact GTO line"
        );
        require(
            GtoPauseLocationParser.extractAfterLastSeparator(
                GtoPauseScreenDetectionPolicy.valueAfterLabel("Destino: Supermercado Santo Antonio — Nova Macaé", "destino")
            ),
            "Nova Macaé",
            "destination local from exact GTO line"
        );
        require(
            GtoPauseScreenDetectionPolicy.valueAfterLabel("Carga: Bebidas", "carga"),
            "Bebidas",
            "cargo from exact GTO line"
        );
        require(
            GtoPauseLocationParser.extractAfterLastSeparator(
                GtoPauseScreenDetectionPolicy.valueAfterLabel("Origem: Cooper Log", "origem")
            ),
            "",
            "missing origin separator remains pending"
        );
        System.out.println("PASS GtoPauseScreenDetectionPolicy: raw labels, route separators and pending safety validated");
    }
}
