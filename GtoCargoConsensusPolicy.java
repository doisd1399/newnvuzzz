package com.nvu.operacional;

import java.text.Normalizer;
import java.util.Locale;

/**
 * HF104: cargo confirmation must be based on two concordant reads of the same
 * operational field. This policy never fuzzy-corrects OCR; it only decides whether
 * two literal candidates are exactly the same after conservative whitespace/Unicode
 * normalization.
 */
final class GtoCargoConsensusPolicy {
    static final int REQUIRED_READS = 2;

    private GtoCargoConsensusPolicy() {}

    static boolean validCandidate(String value) {
        return GtoFreightReviewPolicy.isAutomaticTextUsable(value)
            && !normalize(value).isEmpty();
    }

    static boolean sameCandidate(String first, String second) {
        String a = normalize(first);
        String b = normalize(second);
        return !a.isEmpty() && a.equals(b);
    }

    static String normalize(String value) {
        if (value == null) return "";
        String normalized = Normalizer.normalize(value.trim().toLowerCase(Locale.ROOT), Normalizer.Form.NFD)
            .replaceAll("\\p{M}+", "")
            .replaceAll("\\s+", " ")
            .trim();
        return normalized;
    }

    static boolean confirmed(int reads) {
        return reads >= REQUIRED_READS;
    }

    static int nextReadCount(String previousValue, int previousReads, String candidate) {
        if (!validCandidate(candidate)) return 0;
        if (sameCandidate(previousValue, candidate)) {
            return Math.min(REQUIRED_READS, Math.max(0, previousReads) + 1);
        }
        return 1;
    }
}
