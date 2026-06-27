import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AppProvider, useAppStore } from "./context/AppContext";

// Placeholders for Pages
import Portal from "./pages/Portal";
import Login from "./pages/Login";
import AdminLayout from "./layouts/AdminLayout";
import DriverLayout from "./layouts/DriverLayout";

import AdminFleet from "./pages/admin/Fleet";
import AdminOperations from "./pages/admin/Operations";
import SeniorPanel from "./pages/admin/SeniorPanel";

import DriverProfile from "./pages/driver/Profile";
import RecordTrip from "./pages/driver/RecordTrip";
import RecruitmentApply from "./pages/RecruitmentApply";
import ApplicationStatus from "./pages/ApplicationStatus";

import TripHistory from "./pages/driver/TripHistory";
import JoinCompany from "./pages/driver/JoinCompany";

import SelectProfile from "./pages/SelectProfile";

import RegisterCompany from "./pages/RegisterCompany";

import AssignJob from "./pages/admin/AssignJob";
import AddDriver from "./pages/admin/AddDriver";
import ManageContract from "./pages/admin/ManageContract";
import DriverProfileIsolated from "./pages/admin/DriverProfileIsolated";
import ContractDetailsPage from "./pages/admin/ContractDetailsPage";
import Reports from "./pages/admin/Reports";

import RankingGlobal from "./pages/RankingGlobal";

const ProtectedRoute = ({
  children,
  allowedRole,
}: {
  children: React.ReactNode;
  allowedRole: "admin" | "driver";
}) => {
  const { currentUser, authInitialized, activeRole, activeCompanyId } =
    useAppStore();

  if (!authInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#09090b]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!currentUser) return <Navigate to="/" replace />;
  if (!activeCompanyId || !activeRole)
    return <Navigate to="/select-profile" replace />;

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
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Portal />} />
        <Route path="/login" element={<Login />} />
        <Route path="/select-profile" element={<SelectProfile />} />
        <Route path="/apply" element={<RecruitmentApply />} />
        <Route path="/apply/:companyId" element={<RecruitmentApply />} />
        <Route path="/register-company" element={<RegisterCompany />} />
        <Route path="/status" element={<ApplicationStatus />} />

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

    const runMigration = async () => {
      try {
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
          await batch.commit();
          console.log(`[Legacy Migration] Lote com ${updates} contratos concluído com sucesso.`);
        }
        localStorage.setItem("legacy_migration_v2_done", "true");
      } catch (e) {
        console.error("Migration error:", e);
      }
    };

    runMigration();
  }, [jobs, contracts]);

  return null;
};

export default function App() {
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        event.data?.type === "google-oauth-success" &&
        event.data?.refreshToken
      ) {
        localStorage.setItem("google_refresh_token", event.data.refreshToken);

        console.log("Google Drive conectado");
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  return (
    <AppProvider>
      <LegacyMigration />
      <Toaster position="top-right" richColors />
      <AppRoutes />
    </AppProvider>
  );
}
