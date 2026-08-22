package com.nvu.operacional;

/**
 * HF77 parser for pause-menu lines in the form "Empresa – Local".
 * It deliberately refuses to use the whole line when no separator is present.
 */
final class GtoPauseLocationParser {
    private GtoPauseLocationParser() {}

    static String extractAfterLastSeparator(String raw) {
        if (raw == null) return "";
        String value = normalizeWhitespace(raw);
        if (value.isEmpty()) return "";

        int separator = -1;
        for (int i = value.length() - 1; i >= 0; i--) {
            char c = value.charAt(i);
            if (c == '-' || c == '\u2013' || c == '\u2014') {
                separator = i;
                break;
            }
        }
        if (separator <= 0 || separator >= value.length() - 1) return "";

        String company = normalizeWhitespace(value.substring(0, separator));
        String local = normalizeWhitespace(value.substring(separator + 1));
        if (company.isEmpty() || local.isEmpty()) return "";
        if (!hasUsefulLetters(company) || !hasUsefulLetters(local)) return "";
        return local;
    }

    private static String normalizeWhitespace(String value) {
        return value == null ? "" : value.replaceAll("\\s+", " ").trim();
    }

    private static boolean hasUsefulLetters(String value) {
        int letters = 0;
        for (int i = 0; i < value.length(); i++) {
            if (Character.isLetter(value.charAt(i))) letters++;
        }
        return letters >= 2;
    }
}
