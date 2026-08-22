package com.nvu.operacional;

public final class GtoHf102FreightFieldMappingTest {
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        System.out.println("PASS " + message);
    }

    public static void main(String[] args) {
        check(
            "Cruz do Oeste".equals(
                GtoPauseLocationParser.extractAfterLastSeparator("Cooper Log – Cruz do Oeste")
            ),
            "origem usa somente o local após o separador final"
        );
        check(
            "Nova Macaé".equals(
                GtoPauseLocationParser.extractAfterLastSeparator("Supermercado Santo Antonio - Nova Macaé")
            ),
            "destino usa somente o local após o separador final"
        );
        check(
            "Nova Macaé".equals(
                GtoPauseLocationParser.extractAfterLastSeparator("Empresa A — Centro — Nova Macaé")
            ),
            "último separador vence quando a empresa contém separador"
        );
        check(
            GtoPauseLocationParser.extractAfterLastSeparator("Origem e") .isEmpty(),
            "fragmento de rótulo sem separador não vira localização"
        );
        check(
            GtoPauseLocationParser.extractAfterLastSeparator("Bebidas") .isEmpty(),
            "carga sem estrutura Empresa–Local não vira localização"
        );
        check(
            !GtoFreightReviewPolicy.isAutomaticTextUsable("Origem e"),
            "fragmento OCR Origem e não é campo operacional utilizável"
        );
        check(
            GtoFreightReviewPolicy.DESTINATION.equals(
                GtoFreightReviewPolicy.firstRequiredField(
                    "Bebidas", "Cruz do Oeste", "", "Cruz do Oeste", "600Km", "R$ 10.400,00"
                )
            ),
            "origem e destino iguais exigem releitura do destino"
        );
        check(
            "".equals(
                GtoFreightReviewPolicy.firstRequiredField(
                    "Bebidas", "Cruz do Oeste", "", "Nova Macaé", "600Km", "R$ 10.400,00"
                )
            ),
            "conjunto canônico Bebidas/Cruz do Oeste/Nova Macaé é aceito"
        );
    }
}
