"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasSeniorClaim = hasSeniorClaim;
exports.requireSenior = requireSenior;
const functions = require("firebase-functions");
function normalizedRoles(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .filter((role) => typeof role === "string")
        .map((role) => role.trim().toLowerCase())
        .filter(Boolean);
}
function hasSeniorClaim(context) {
    var _a;
    const token = (_a = context.auth) === null || _a === void 0 ? void 0 : _a.token;
    if (!token)
        return false;
    return (token.senior === true ||
        token.isSenior === true ||
        String(token.role || "").trim().toLowerCase() === "senior" ||
        normalizedRoles(token.roles).includes("senior"));
}
function requireSenior(context, message = "Permissão Sênior obrigatória.") {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Autenticação obrigatória.");
    }
    if (!hasSeniorClaim(context)) {
        throw new functions.https.HttpsError("permission-denied", message);
    }
}
//# sourceMappingURL=authorization.js.map