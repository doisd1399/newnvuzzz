import { functions } from "../lib/firebase";
import { httpsCallable } from "firebase/functions";

interface SendPushParams {
  companyId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export async function sendPushToAdmins(params: SendPushParams) {
  try {
    console.log(`[NVU PUSH] Enviando requisição de push para admins da empresa ${params.companyId}...`);
    const sendPushNotification = httpsCallable(functions, "sendPushNotification");
    const result = await sendPushNotification(params);
    
    console.log("[NVU PUSH] Push enviado com sucesso:", result.data);
    return result.data;
  } catch (error) {
    console.error("[NVU PUSH ERROR] Falha ao enviar push notification:", error);
  }
}
