import React, { useMemo } from "react";
import { useAppStore } from "./AppContext";

export type NotificationItem = {
  id?: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt?: unknown;
  targetProfile?: "driver" | "corporate";
  userId?: string;
  companyId?: string;
};

/**
 * Adaptador de compatibilidade.
 *
 * O AppContext é a única fonte de dados das notificações internas. Manter um
 * segundo listener Firestore aqui recriava estados divergentes entre sino,
 * popup e perfil ativo. O Provider permanece apenas para não quebrar imports
 * antigos.
 */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useNotifications() {
  const { notifications, markNotificationAsRead } = useAppStore();

  return useMemo(
    () => ({
      notifications: notifications.map((notification) => ({
        id: notification.id,
        title: notification.title ?? notification.titulo,
        message: notification.message ?? notification.mensagem,
        type: notification.type ?? notification.tipo,
        read: notification.read ?? notification.lida,
        createdAt: notification.createdAt,
        targetProfile: notification.targetProfile,
        userId: notification.userId,
        companyId: notification.companyId,
      })),
      unreadCount: notifications.filter((notification) => !notification.lida).length,
      refreshNotifications: async () => {},
      markAsRead: markNotificationAsRead,
    }),
    [notifications, markNotificationAsRead],
  );
}
