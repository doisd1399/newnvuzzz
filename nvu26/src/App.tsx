import React, { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Toaster } from "sonner";
import NotificationToastListener from "./components/NotificationToastListener";
import { AppProvider, useAppStore } from "./context/AppContext";
import { registerDeviceForPush } from "./lib/capacitorPushService";
import { isAuthTeardownActive, onAuthTeardown } from "./lib/authLifecycle";

// Placeholders for Pages
import Portal from "./pages/Portal";
import Login from "./pages/Login";
import AdminLayout from "./layouts/AdminLayout";
import DriverLayout from "./layouts/DriverLayout";
import DriverProfile from "./pages/driver/Profile";
import DriverProfileIsolated from "./pages/admin/DriverProfileIsolated";

const AdminFleet = lazy(() => import("./pages/admin/Fleet"));
const SeniorPanel = lazy(() => import("./pages/admin/SeniorPanel"));

const RecordTrip = lazy(() => import("./pages/driver/RecordTrip"));
const RecruitmentApply = lazy(() => import("./pages/RecruitmentApply"));
const AuditPage = lazy(() => import("./pages/AuditPage"));
const ApplicationStatus = lazy(() => import("./pages/ApplicationStatus"));

const TripHistory = lazy(() => import("./pages/driver/TripHistory"));
const JoinCompany = lazy(() => import("./pages/driver/JoinCompany"));

const SelectProfile = lazy(() => import("./pages/SelectProfile"));

const RegisterCompany = lazy(() => import("./pages/RegisterCompany"));

const AssignJob = lazy(() => import("./pages/admin/AssignJob"));
const AddDriver = lazy(() => import("./pages/admin/AddDriver"));
const ManageContract = lazy(() => import("./pages/admin/ManageContract"));
const ContractDetailsPage = lazy(() => import("./pages/admin/ContractDetailsPage"));
const Reports = lazy(() => import("./pages/admin/Reports"));

const RankingGlobal = lazy(() => import("./pages/RankingGlobal"));

const RouteLoading = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#09090b]">
    <div className="flex flex-col items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      <span>Carregando…</span>
    </div>
  </div>
);

const RouteWarmup = () => {
  const { authInitialized, activeRole } = useAppStore();

  useEffect(() => {
    if (!authInitialized || !activeRole) return;

    const commonLoaders =
      activeRole === "admin"
        ? [
            () => import("./pages/admin/Fleet"),
            () => import("./pages/admin/Reports"),
            () => import("./pages/RankingGlobal"),
          ]
        : [
            () => import("./pages/driver/TripHistory"),
            () => import("./pages/admin/Reports"),
            () => import("./pages/RankingGlobal"),
          ];

    const warmRoutes = () => {
      commonLoaders.forEach((load) => void load());
    };

    const idleWindow = (window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    }).requestIdleCallback;

    if (idleWindow) {
      const idleId = idleWindow(warmRoutes, { timeout: 2000 });
      return () => {
        (window as Window & { cancelIdleCallback?: (id: number) => void })
          .cancelIdleCallback?.(idleId);
      };
    }

    const timer = window.setTimeout(warmRoutes, 1200);
    return () => window.clearTimeout(timer);
  }, [authInitialized, activeRole]);

  return null;
};

const ProtectedRoute = ({
  children,
  allowedRole,
}: {
  children: React.ReactNode;
  allowedRole: "admin" | "driver";
}) => {
  const {
    currentUser,
    authInitialized,
    membershipsLoaded,
    activeRole,
    activeCompanyId,
    memberships,
    companies,
    isSeniorAuthenticated,
    seniorCompanyId,
  } =
    useAppStore();

  if (!authInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#09090b]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!currentUser) return <Navigate to="/" replace />;
  if (!membershipsLoaded && !isSeniorAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#09090b]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  if (!activeCompanyId || !activeRole)
    return <Navigate to="/select-profile" replace />;

  const activeMembership = memberships.find(
    (membership) =>
      membership.companyId === activeCompanyId &&
      membership.status === "active",
  );
  const activeCompany = companies.find((company) => company.id === activeCompanyId);
  const isOwner = Boolean(
    activeCompany &&
      (activeCompany.ownerId === currentUser.id ||
        activeCompany.userId === currentUser.id),
  );
  const hasRoleForCompany =
    isSeniorAuthenticated && seniorCompanyId === activeCompanyId
      ? allowedRole === "admin"
      : allowedRole === "admin"
        ? Boolean(
            activeMembership?.roles?.includes("admin") ||
              isOwner ||
              (currentUser.roles?.includes("admin") &&
                currentUser.companyId === activeCompanyId),
          )
        : Boolean(
            activeMembership?.roles?.includes("driver") ||
              currentUser.roles?.includes("driver"),
          );

  if (!hasRoleForCompany) {
    return <Navigate to="/select-profile" replace />;
  }

  if (activeRole !== allowedRole) {
    return (
      <Navigate to={activeRole === "admin" ? "/admin" : "/driver"} replace />
    );
  }

  return <>{children}</>;
};

function AppRoutes() {
  return (
    <BrowserRouter>
      <NotificationToastListener />
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Portal />} />
        <Route path="/login" element={<Login />} />
        <Route path="/select-profile" element={<SelectProfile />} />
        <Route path="/apply" element={<RecruitmentApply />} />
        <Route path="/apply/:companyId" element={<RecruitmentApply />} />
        <Route path="/register-company" element={<RegisterCompany />} />
        <Route path="/status" element={<ApplicationStatus />} />
        <Route path="/audit" element={<AuditPage />} />

        {/* Admin Routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRole="admin">
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="fleet" replace />} />
          <Route path="fleet" element={<AdminFleet />} />
          <Route path="operations" element={<Navigate to="fleet" replace />} />
          <Route path="assign" element={<AssignJob />} />
          <Route path="add-driver" element={<AddDriver />} />
          <Route path="contract/new" element={<ManageContract />} />
          <Route path="contract/:id" element={<ContractDetailsPage />} />
          <Route path="contract/:id/edit" element={<ManageContract />} />
          <Route path="senior" element={<SeniorPanel />} />
          <Route path="reports" element={<Reports />} />
          <Route path="history" element={<TripHistory />} />
          <Route path="driver/:id" element={<DriverProfileIsolated />} />
        </Route>

        {/* Driver Routes */}
        <Route path="/ranking" element={<RankingGlobal />} />
        <Route
          path="/driver"
          element={
            <ProtectedRoute allowedRole="driver">
              <DriverLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="profile" replace />} />
          <Route path="profile" element={<DriverProfile />} />
          <Route path="join" element={<JoinCompany />} />
          <Route path="trip" element={<RecordTrip />} />
          <Route path="history" element={<TripHistory />} />
          <Route path="reports" element={<Reports />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

const LegacyMigration = () => {
  const { jobs, contracts } = useAppStore();

  useEffect(() => {
    if (jobs.length === 0 || contracts.length === 0) return;
    
    // Usando uma nova chave para garantir a execução
    if (localStorage.getItem("legacy_migration_v2_done")) return;

    let cancelled = false;
    const removeTeardownListener = onAuthTeardown(() => {
      cancelled = true;
    });

    const runMigration = async () => {
      try {
        if (cancelled || isAuthTeardownActive()) return;
        const { getFirestore, writeBatch, doc } = await import("firebase/firestore");
        const db = getFirestore();
        const batch = writeBatch(db);
        let updates = 0;

        const startDate = new Date("2026-06-01T00:00:00-03:00");
        const endDate = new Date("2026-06-12T23:59:59-03:00");

        console.log("=== RELATÓRIO DE MIGRAÇÃO DE CONTRATOS LEGADOS ===");
        let totalAnalyzed = 0;
        let metCriteria = 0;
        let actuallyUpdated = 0;

        for (const job of jobs) {
          if (cancelled || isAuthTeardownActive()) return;
          totalAnalyzed++;
          
          if (job.status !== "completed") {
            continue;
          }

          const contract = contracts.find((c) => c.id === job.contractId);
          if (!contract) {
             continue;
          }

          const TARGET_CONTRACT_IDS = ["id_do_contrato_bs10", "id_do_contrato_bs20"];
          const isTargetContract = TARGET_CONTRACT_IDS.includes(contract.id);

          if (!isTargetContract) {
            continue;
          }

          const hasNewTemporalFields = !!job.completedAt || !!job.assignedAt || !!job.dueAt;
          
          const dateStr = job.createdAt || job.deadlineDate || "";
          const jobDate = dateStr ? new Date(dateStr) : null;
          let isWithinDateRange = false;
          if (jobDate && !isNaN(jobDate.getTime())) {
             isWithinDateRange = jobDate >= startDate && jobDate <= endDate;
          }

          if (isTargetContract && !hasNewTemporalFields && isWithinDateRange) {
              metCriteria++;
              
              if (job.completionStatus !== "on_time") {
                console.log(`[Job ${job.id}] Elegível. Alterando para 'on_time'. (Contrato ID: ${contract.id}, Data: ${dateStr})`);
                const ref = doc(db, "trabalhos", job.id);
                batch.update(ref, { completionStatus: "on_time" });
                updates++;
                actuallyUpdated++;
              } else {
                console.log(`[Job ${job.id}] Elegível, mas já testava como 'on_time'.`);
              }
          } else {
             console.log(`[Job ${job.id}] Contrato ${contract.id} ignorado. Motivos: 
               - Campos novos detectados: ${hasNewTemporalFields}
               - Pertence ao intervalo (01 a 12 Jun): ${isWithinDateRange} (${jobDate})`);
          }
        }

        console.log(`- Contratos analisados (total de trabalhos): ${totalAnalyzed}`);
        console.log(`- Contratos que atenderam aos critérios (elegíveis): ${metCriteria}`);
        console.log(`- Contratos efetivamente atualizados para 'on_time': ${actuallyUpdated}`);
        console.log("==================================================");

        if (updates > 0) {
          if (cancelled || isAuthTeardownActive()) return;
          await batch.commit();
          console.log(`[Legacy Migration] Lote com ${updates} contratos concluído com sucesso.`);
        }
        if (!cancelled && !isAuthTeardownActive()) {
          localStorage.setItem("legacy_migration_v2_done", "true");
        }
      } catch (e) {
        if (!cancelled && !isAuthTeardownActive()) {
          console.warn("Migration error:", e);
        }
      }
    };

    void runMigration();
    return () => {
      cancelled = true;
      removeTeardownListener();
    };
  }, [jobs, contracts]);

  return null;
};

const ContractSnapshotMigration = () => {
  const { jobs, contracts } = useAppStore();

  useEffect(() => {
    if (jobs.length === 0 || contracts.length === 0) return;

    if (localStorage.getItem("contract_snapshot_migration_v1_done")) return;

    let cancelled = false;
    const removeTeardownListener = onAuthTeardown(() => {
      cancelled = true;
    });

    const runMigration = async () => {
      try {
        if (cancelled || isAuthTeardownActive()) return;
        const { getFirestore, writeBatch, doc } = await import("firebase/firestore");
        const db = getFirestore();
        const batch = writeBatch(db);
        let updates = 0;

        console.log("=== INICIANDO MIGRAÇÃO DE CONTRATOS (SNAPSHOTS) ===");

        for (const job of jobs) {
          if (cancelled || isAuthTeardownActive()) return;
          if (job.status !== "completed") continue;
          if (job.contractNameSnapshot) continue; // Already migrated

          const contract = contracts.find((c) => c.id === job.contractId);
          const finalName = contract?.name || (contract as any)?.nome || (job as any).contractName || (job as any).nomeContrato || "Contrato não identificado";
          const ref = doc(db, "trabalhos", job.id);
          batch.update(ref, { contractNameSnapshot: finalName });
          updates++;
          console.log(`[Snapshot Migration] Atualizando job ${job.id} com contrato: ${finalName}`);
        }

        if (updates > 0) {
          if (cancelled || isAuthTeardownActive()) return;
          await batch.commit();
          console.log(`[Snapshot Migration] ${updates} jobs atualizados.`);
        } else {
          console.log(`[Snapshot Migration] Nenhum job precisava ser atualizado.`);
        }

        if (!cancelled && !isAuthTeardownActive()) {
          localStorage.setItem("contract_snapshot_migration_v1_done", "true");
        }
      } catch (e) {
        if (!cancelled && !isAuthTeardownActive()) {
          console.warn("[Snapshot Migration] Erro:", e);
        }
      }
    };

    void runMigration();
    return () => {
      cancelled = true;
      removeTeardownListener();
    };
  }, [jobs, contracts]);

  return null;
};

export default function App() {
  console.log('[NVU PUSH BOOT] App iniciado');

  // Inicialização de teste temporária para validar o plugin de Push no Android
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      console.log('[NVU PUSH NATIVE READY] Capacitor Native Platform detectada.');
      console.log('[NVU PUSH BOOT] Disparando registerDeviceForPush de teste no boot...');
      registerDeviceForPush({}).catch(err => {
        if (!isAuthTeardownActive()) {
          console.warn('[NVU PUSH ERROR] Falha no registerDeviceForPush do boot', err);
        }
      });
    }
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let backButtonListener: { remove: () => Promise<void> } | null = null;

    const registerBackButton = async () => {
      backButtonListener = await CapacitorApp.addListener(
        "backButton",
        ({ canGoBack }) => {
          if (canGoBack) {
            window.history.back();
          } else {
            void CapacitorApp.exitApp();
          }
        },
      );
    };

    void registerBackButton();

    return () => {
      if (backButtonListener) void backButtonListener.remove();
    };
  }, []);

  return (
    <AppProvider>
      <ContractSnapshotMigration />
      <LegacyMigration />
      <RouteWarmup />
      <Toaster position="top-right" richColors />
      <Suspense fallback={<RouteLoading />}>
        <AppRoutes />
      </Suspense>
    </AppProvider>
  );
}
