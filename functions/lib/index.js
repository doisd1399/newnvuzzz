"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPushNotification = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
exports.sendPushNotification = functions.https.onCall(async (data, context) => {
    // Opcional: Validar se o usuário está autenticado
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "O usuário precisa estar autenticado para enviar notificações.");
    }
    const { companyId, title, body, data: payloadData } = data;
    if (!companyId || !title || !body) {
        throw new functions.https.HttpsError("invalid-argument", "companyId, title e body são obrigatórios.");
    }
    const db = admin.firestore();
    const adminIds = new Set();
    try {
        // 1. Localizar proprietário e administradores
        const companySnapshot = await db.collection("frotas").doc(companyId).get();
        if (companySnapshot.exists) {
            const company = companySnapshot.data();
            if (company === null || company === void 0 ? void 0 : company.ownerId)
                adminIds.add(company.ownerId);
            if (company === null || company === void 0 ? void 0 : company.userId)
                adminIds.add(company.userId);
        }
        const membersSnapshot = await db.collection("companyMembers")
            .where("companyId", "==", companyId)
            .get();
        membersSnapshot.forEach((doc) => {
            const member = doc.data();
            const roles = Array.isArray(member.roles) ? member.roles : [];
            if (roles.includes("admin")) {
                adminIds.add(member.userId);
            }
        });
        if (adminIds.size === 0) {
            console.log(`[NVU PUSH] Nenhum administrador encontrado para a empresa: ${companyId}`);
            return { success: false, reason: "no_admins_found" };
        }
        // 2. Buscar os tokens FCM dos administradores
        const tokens = [];
        const devicesSnapshot = await db.collection("userDevices").get();
        devicesSnapshot.forEach((deviceDoc) => {
            const device = deviceDoc.data();
            if (device.token && adminIds.has(device.userId)) {
                tokens.push(device.token);
            }
        });
        if (tokens.length === 0) {
            console.log("[NVU PUSH] Nenhum token FCM encontrado para os administradores.");
            return { success: false, reason: "no_tokens_found" };
        }
        const message = {
            notification: {
                title,
                body,
            },
            data: payloadData || {},
            tokens,
        };
        const response = await admin.messaging().sendEachForMulticast(message);
        let successCount = response.successCount;
        let failureCount = response.failureCount;
        // Remover tokens inválidos do Firestore
        if (failureCount > 0) {
            const failedTokens = [];
            response.responses.forEach((resp, idx) => {
                var _a;
                if (!resp.success) {
                    const errorCode = (_a = resp.error) === null || _a === void 0 ? void 0 : _a.code;
                    if (errorCode === "messaging/invalid-registration-token" ||
                        errorCode === "messaging/registration-token-not-registered") {
                        failedTokens.push(tokens[idx]);
                    }
                }
            });
            if (failedTokens.length > 0) {
                console.log(`Removendo ${failedTokens.length} tokens inválidos.`);
                for (const token of failedTokens) {
                    const snapshot = await db
                        .collection("userDevices")
                        .where("token", "==", token)
                        .get();
                    snapshot.forEach((doc) => {
                        doc.ref.delete();
                    });
                }
            }
        }
        return {
            success: true,
            successCount,
            failureCount,
        };
    }
    catch (error) {
        console.error("Erro ao processar push notification:", error);
        throw new functions.https.HttpsError("internal", "Erro interno ao enviar push.");
    }
});
//# sourceMappingURL=index.js.map