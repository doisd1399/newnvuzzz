package com.nvu.operacional;

import java.util.Arrays;
import java.util.Collections;

public final class GtoCityTextResolverTest {
    public static void main(String[] args) {
        requireCanonical("Itopetuna", "Itapetuna");
        requireCanonical("Nova Macae", "Nova Macaé");
        requireCanonical("Aguas Velhas", "Águas Velhas");
        requireCanonical("Registro", "Registro");
        requireCanonical("Faz Areia Dourad", "Faz Areia Dourada");
        requireCanonical("Cruz do Oest", "Cruz do Oeste");
        requireCanonical("Cooperativa Agro Grao", "Cooperativa Agro Grão");
        requireCanonical("Curitba", "Curitiba");
        requireCanonical("Lages", "Lages");
        requireCanonical("Lauro Muler", "Lauro Muller");

        GtoCityTextResolver.Resolution approvedWins = GtoCityTextResolver.resolveTrusted(
            "Itopetuna", "", Arrays.asList("Itepetuna", "São Paulo")
        );
        require(approvedWins.corrected && "Itapetuna".equals(approvedWins.value),
            "approved canonical destination must win over an ambiguous external near-match");

        GtoCityTextResolver.Resolution unrelated = GtoCityTextResolver.resolveTrusted(
            "Cuiabá", "", Arrays.asList("São Paulo")
        );
        require(!unrelated.corrected && "Cuiabá".equals(unrelated.value),
            "unrelated OCR text must never be rewritten by the approved list");

        GtoCityTextResolver.Resolution precise = GtoCityTextResolver.preferPreciseVerifiedRow(
            "Cidade Alfa", 0.79f, "Cidade Alga", 0.91f
        );
        require(precise.corrected && "Cidade Alga".equals(precise.value),
            "higher-confidence exact-row OCR may still repair one glyph outside the approved list");

        GtoCityTextResolver.Resolution weakPrecise = GtoCityTextResolver.preferPreciseVerifiedRow(
            "Cidade Alfa", 0.88f, "Cidade Alga", 0.89f
        );
        require(!weakPrecise.corrected,
            "nearly equal confidence must preserve multi-frame page spelling");

        require(!GtoCityTextResolver.isSafeOneEditVariant("Metalurgica", "Itapetuna"),
            "company names must never be treated as destination corrections");

        System.out.println("GtoCityTextResolverTest: PASS");
    }

    private static void requireCanonical(String ocr, String expected) {
        GtoCityTextResolver.Resolution resolution = GtoCityTextResolver.resolveTrusted(
            ocr, "", Collections.emptyList()
        );
        require(expected.equals(resolution.value), "canonical mismatch for " + ocr + ": " + resolution.value);
        require(resolution.corrected || ocr.equals(expected), "canonical correction not marked for " + ocr);
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
