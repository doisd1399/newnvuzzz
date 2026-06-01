import React, { useState, useEffect, useMemo } from "react";
import { useAppStore } from "../../context/AppContext";
import { Card, CardContent } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { 
  CheckCircle2, XCircle, Building2, Users, FileText, 
  TrendingUp, Truck, Package, Settings, ChevronLeft,
  Briefcase, ArrowRight, Activity, Gamepad2, Navigation
} from "lucide-react";
import { db, auth } from "../../lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  updateDoc,
  doc,
  deleteDoc,
  setDoc,
  writeBatch,
  onSnapshot
} from "firebase/firestore";
import { toast } from "sonner";
import { cn } from "../../lib/utils";

export default function SeniorPanel() {
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);

  // Global Data States
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [allCompanies, setAllCompanies] = useState<any[]>([]);
  const [allMembers, setAllMembers] = useState<any[]>([]);
  const [allContracts, setAllContracts] = useState<any[]>([]);
  const [allJobs, setAllJobs] = useState<any[]>([]);
  const [allVehicles, setAllVehicles] = useState<any[]>([]);
  const [allTrailers, setAllTrailers] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [systemSettings, setSystemSettings] = useState<any>({});

  // UI States
  const [activeTab, setActiveTab] = useState<'requests' | 'approved' | 'profile' | 'settings'>('requests');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmRejectId, setConfirmRejectId] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      const unsubs: any[] = [];
      
      const qRegs = query(
        collection(db, "recruitment_applications"),
        where("status", "==", "pending"),
        where("type", "==", "company_registration")
      );
      unsubs.push(onSnapshot(qRegs, (snap) => setRegistrations(snap.docs.map(d => ({id: d.id, ...d.data()})))));

      unsubs.push(onSnapshot(collection(db, "frotas"), (snap) => setAllCompanies(snap.docs.map(d => ({id: d.id, ...d.data()})))));
      unsubs.push(onSnapshot(collection(db, "companyMembers"), (snap) => setAllMembers(snap.docs.map(d => ({id: d.id, ...d.data()})))));
      unsubs.push(onSnapshot(collection(db, "contratos"), (snap) => setAllContracts(snap.docs.map(d => ({id: d.id, ...d.data()})))));
      unsubs.push(onSnapshot(collection(db, "trabalhos"), (snap) => setAllJobs(snap.docs.map(d => ({id: d.id, ...d.data()})))));
      unsubs.push(onSnapshot(collection(db, "veiculos"), (snap) => setAllVehicles(snap.docs.map(d => ({id: d.id, ...d.data()})))));
      unsubs.push(onSnapshot(collection(db, "reboques"), (snap) => setAllTrailers(snap.docs.map(d => ({id: d.id, ...d.data()})))));
      unsubs.push(onSnapshot(collection(db, "users"), (snap) => setAllUsers(snap.docs.map(d => ({id: d.id, ...d.data()})))));
      unsubs.push(onSnapshot(doc(db, "settings", "system"), (snap) => {
        if (snap.exists()) setSystemSettings(snap.data());
      }));

      return () => unsubs.forEach(unsub => unsub());
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Validate origin if possible, but '*' acts as wildcard for same-app
      if (event.data?.type === 'google-oauth-success') {
        const { refreshToken } = event.data;
        if (refreshToken) {
          try {
            await setDoc(doc(db, "settings", "system"), { driveRefreshToken: refreshToken }, { merge: true });
            toast.success("Google Drive conectado com sucesso!");
          } catch (e: any) {
            toast.error("Erro ao salvar token: " + e.message);
          }
        } else {
          toast.error("Não foi possível conectar ao Google Drive. Autorização negada ou falha.");
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const companyStats = useMemo(() => {
    return allCompanies.map(c => {
      const members = allMembers.filter(m => m.companyId === c.id && m.status === 'active');
      const jobs = allJobs.filter(j => j.companyId === c.id);
      const owner = allUsers.find(u => u.id === c.userId);
      
      return {
        ...c,
        ownerEmail: owner?.email || "N/A",
        totalEmployees: members.length,
        totalDrivers: members.filter(m => m.roles.includes('driver')).length,
        totalAdmins: members.filter(m => m.roles.includes('admin')).length,
        totalContracts: allContracts.filter(ct => ct.companyId === c.id).length,
        totalTrips: jobs.length,
        totalDeliveries: jobs.reduce((acc, j) => acc + (j.progress || 0), 0),
        totalVehicles: allVehicles.filter(v => v.companyId === c.id).length,
        totalTrailers: allTrailers.filter(t => t.companyId === c.id).length,
      };
    });
  }, [allCompanies, allMembers, allContracts, allJobs, allVehicles, allTrailers]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "9173") {
      setIsAuthenticated(true);
    } else {
      toast.error("Senha incorreta.");
    }
  };

  const handleApprove = async (reg: any) => {
    try {
      setLoadingAction(true);
      if (auth.currentUser) await auth.currentUser.getIdToken(true);

      const batch = writeBatch(db);
      const newCompanyRef = doc(collection(db, "frotas"));

      const companyPayload = {
        companyName: reg.companyName,
        fleetName: reg.fleetName,
        ownerName: reg.ownerName,
        simulatorName: reg.simulatorName || "Euro Truck Simulator 2",
        cnpj: reg.cnpj,
        whatsapp: reg.whatsapp || "",
        userId: "", 
        logoUrl: reg.photoURL || "",
        ownerPhotoUrl: reg.ownerPhotoUrl || "",
        status: "active",
        createdAt: new Date().toISOString(),
      };

      let finalUserId = "";

      // 1. Try reg.userId first if available on application
      if (reg.userId) {
        finalUserId = reg.userId;
        const userRef = doc(db, "users", reg.userId);
        
        batch.set(userRef, {
          companyId: newCompanyRef.id,
          role: "admin",
          roles: ["admin", "driver"],
          ...(reg.ownerPhotoUrl && { photoURL: reg.ownerPhotoUrl, avatar: reg.ownerPhotoUrl }),
          status: "active",
        }, { merge: true });

        const newMemberRef = doc(collection(db, "companyMembers"));
        batch.set(newMemberRef, {
          companyId: newCompanyRef.id,
          userId: finalUserId,
          roles: ["admin", "driver"],
          status: "active",
          permissions: ["admin", "owner", "manage_fleet", "all"],
          joinedAt: new Date().toISOString()
        });
      }

      // 2. Fallback search by email if reg.userId was not set or didn't exist
      if (!finalUserId && reg.email) {
        const userQ = query(
          collection(db, "users"),
          where("email", "==", reg.email.trim().toLowerCase()),
        );
        const userQs = await getDocs(userQ);

        if (!userQs.empty) {
          finalUserId = userQs.docs[0].id;
          const userRef = doc(db, "users", finalUserId);

          batch.update(userRef, {
            companyId: newCompanyRef.id,
            role: "admin",
            roles: ["admin", "driver"],
            ...(reg.ownerPhotoUrl && { photoURL: reg.ownerPhotoUrl, avatar: reg.ownerPhotoUrl }),
            status: "active",
          });
          
          const newMemberRef = doc(collection(db, "companyMembers"));
          batch.set(newMemberRef, {
            companyId: newCompanyRef.id,
            userId: finalUserId,
            roles: ["admin", "driver"],
            status: "active",
            permissions: ["admin", "owner", "manage_fleet", "all"],
            joinedAt: new Date().toISOString()
          });
        } else {
          const newUserRef = doc(collection(db, "users"));
          finalUserId = newUserRef.id;

          batch.set(newUserRef, {
            email: reg.email.trim().toLowerCase(),
            name: reg.ownerName,
            status: "active",
            companyId: newCompanyRef.id,
            role: "admin",
            roles: ["admin", "driver"],
            photoURL: reg.ownerPhotoUrl || "",
            avatar: reg.ownerPhotoUrl || "",
            createdAt: new Date().toISOString(),
          });
          
          const newMemberRef = doc(collection(db, "companyMembers"));
          batch.set(newMemberRef, {
            companyId: newCompanyRef.id,
            userId: finalUserId,
            roles: ["admin", "driver"],
            status: "active",
            permissions: ["admin", "owner", "manage_fleet", "all"],
            joinedAt: new Date().toISOString()
          });
        }
      }

      // 3. Absolute fallback to ensure finalUserId is never empty
      if (!finalUserId) {
        const newUserRef = doc(collection(db, "users"));
        finalUserId = newUserRef.id;

        batch.set(newUserRef, {
          email: (reg.email || "").trim().toLowerCase(),
          name: reg.ownerName || "Proprietário",
          status: "active",
          companyId: newCompanyRef.id,
          role: "admin",
          roles: ["admin", "driver"],
          photoURL: reg.ownerPhotoUrl || "",
          avatar: reg.ownerPhotoUrl || "",
          createdAt: new Date().toISOString(),
        });
        
        const newMemberRef = doc(collection(db, "companyMembers"));
        batch.set(newMemberRef, {
          companyId: newCompanyRef.id,
          userId: finalUserId,
          roles: ["admin", "driver"],
          status: "active",
          permissions: ["admin", "owner", "manage_fleet", "all"],
          joinedAt: new Date().toISOString()
        });
      }

      // 4. Record ownerId and userId on company payload and save
      const finalCompanyPayload = {
        ...companyPayload,
        userId: finalUserId,
        ownerId: finalUserId,
      };
      batch.set(newCompanyRef, finalCompanyPayload);

      const regRef = doc(db, "recruitment_applications", reg.id);
      batch.update(regRef, { status: "approved" });

      await batch.commit();
      toast.success("Empresa aprovada com sucesso!");
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao aprovar: " + e.message);
    } finally {
      setLoadingAction(false);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await deleteDoc(doc(db, "recruitment_applications", id));
      toast.success("Solicitação recusada.");
      setConfirmRejectId(null);
    } catch (e: any) {
      toast.error("Erro ao recusar: " + e.message);
    }
  };

  const handleDeleteCompany = async (id: string) => {
    try {
      setLoadingAction(true);

      const batch = writeBatch(db);
      
      // Delete the company document
      batch.delete(doc(db, "frotas", id));

      // Remove roles and companyId from users that are associated
      const membersToUpdate = allMembers.filter(m => m.companyId === id);
      membersToUpdate.forEach(m => {
        batch.delete(doc(db, "companyMembers", m.id));
      });

      const usersToUpdate = allUsers.filter(u => u.companyId === id);
      usersToUpdate.forEach(u => {
        batch.update(doc(db, "users", u.id), {
          companyId: null,
          role: null,
          roles: []
        });
      });

      await batch.commit();

      toast.success("Empresa removida com sucesso do sistema.");
      if (selectedCompanyId === id) {
         setActiveTab('approved');
         setSelectedCompanyId(null);
      }
      setConfirmDeleteId(null);
    } catch (e: any) {
       toast.error("Erro ao remover: " + e.message);
    } finally {
       setLoadingAction(false);
    }
  };

  const viewCompanyProfile = (companyId: string) => {
    setSelectedCompanyId(companyId);
    setActiveTab('profile');
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-4">
        <Card className="w-full max-w-sm rounded-[24px] overflow-hidden border border-gray-100 dark:border-[#2A2F3A] bg-white dark:bg-[#1A1F26] shadow-xl dark:shadow-none">
          <CardContent className="p-8">
            <h2 className="text-xl font-bold text-gray-900 dark:text-[#fafafa] mb-2 text-center">
              Painel Senior
            </h2>
            <p className="text-[13px] text-gray-500 dark:text-[#a1a1aa] mb-6 text-center">
              Acesso restrito
            </p>
            <form onSubmit={handleLogin} className="space-y-4">
              <input
                type="password"
                placeholder="Senha de acesso"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-50 dark:bg-[#09090b] border border-gray-200 dark:border-[#2A2F3A] rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500 dark:text-[#fafafa] text-center"
              />
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11">
                Acessar
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedCompany = selectedCompanyId ? companyStats.find(c => c.id === selectedCompanyId) : null;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* Header & Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-[#fafafa] flex items-center gap-2">
            <Building2 className="text-blue-500" />
            Central das Empresas
          </h1>
          <p className="text-[14px] text-gray-500 dark:text-[#d4d4d8] mt-1">
            Gerenciamento global de parceiros e transportadoras
          </p>
        </div>

        {activeTab !== 'profile' && (
          <div className="flex bg-gray-100 dark:bg-[#2A2F3A] p-1 rounded-xl w-fit">
            <button 
              onClick={() => setActiveTab('requests')}
              className={cn("px-4 py-2 text-[14px] font-medium rounded-lg transition-all", activeTab === 'requests' ? "bg-white dark:bg-[#1A1F26] text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-900 dark:hover:text-white")}
            >
              Solicitações
              {registrations.length > 0 && <span className="ml-2 bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 py-0.5 px-2 rounded-full text-[11px] font-bold">{registrations.length}</span>}
            </button>
            <button 
              onClick={() => setActiveTab('approved')}
              className={cn("px-4 py-2 text-[14px] font-medium rounded-lg transition-all", activeTab === 'approved' ? "bg-white dark:bg-[#1A1F26] text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-900 dark:hover:text-white")}
            >
              Aprovadas
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={cn("px-4 py-2 text-[14px] font-medium rounded-lg transition-all", activeTab === 'settings' ? "bg-white dark:bg-[#1A1F26] text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-900 dark:hover:text-white")}
            >
              <Settings size={18} />
            </button>
          </div>
        )}
      </div>

      {activeTab === 'settings' && (
        <div className="space-y-6 animate-in fade-in duration-300">
           <Card className="rounded-[24px] overflow-hidden border border-gray-100 dark:border-[#2A2F3A] bg-white dark:bg-[#1A1F26] shadow-sm dark:shadow-none">
             <CardContent className="p-8 space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-[#fafafa] flex items-center gap-2 mb-2">
                    Integrações de Sistema
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-2xl">
                    Configure os serviços externos e integrações que a plataforma NVU utiliza para operar. Estas configurações são globais.
                  </p>
                </div>
                
                <div className="bg-gray-50 dark:bg-[#09090b] border border-gray-100 dark:border-[#2A2F3A] rounded-2xl p-6 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
                  <div className="space-y-2">
                    <h3 className="font-bold text-gray-900 dark:text-white text-[16px] flex items-center gap-2">
                      Google Drive
                      {systemSettings.driveRefreshToken ? (
                         <span className="bg-green-100 text-green-700 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full tracking-wider">Conectado</span>
                      ) : (
                         <span className="bg-orange-100 text-orange-700 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full tracking-wider">Desconectado</span>
                      )}
                    </h3>
                    <p className="text-sm text-gray-500 max-w-lg leading-relaxed">
                      Conecte a conta Google do proprietário para permitir que todos os motoristas façam o upload dos comprovantes e imagens de viagem para a pasta designada.
                    </p>
                    {systemSettings.driveRefreshToken && (
                      <p className="text-xs text-green-600 font-medium">✔️ Refresh token obtido e salvo com segurança.</p>
                    )}
                  </div>
                  <div className="shrink-0 w-full md:w-auto">
                    {!systemSettings.driveRefreshToken ? (
                       <Button 
                          onClick={() => {
                             window.open("https://backend-drive-ya2b.onrender.com/api/drive/auth", "Google Oauth", "width=600,height=600");
                          }}
                          className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11 px-6 shadow-sm"
                       >
                         Conectar Google Drive
                       </Button>
                    ) : (
                       <Button 
                          onClick={async () => {
                             await updateDoc(doc(db, "settings", "system"), { driveRefreshToken: null });
                             toast.success("Integração do Google Drive removida.");
                          }}
                          className="w-full md:w-auto bg-red-50 hover:bg-red-100 text-red-600 rounded-xl h-11 px-6 shadow-none"
                       >
                         Desconectar
                       </Button>
                    )}
                  </div>
                </div>
             </CardContent>
           </Card>
        </div>
      )}

      {activeTab === 'profile' && selectedCompany && (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
          <Button onClick={() => setActiveTab('approved')} variant="outline" className="h-10 px-4 rounded-xl shadow-sm border-gray-200 dark:border-[#2A2F3A] bg-white dark:bg-[#1A1F26]">
            <ChevronLeft size={18} className="mr-2"/> Voltar para Lista
          </Button>

          <Card className="rounded-[24px] overflow-hidden border border-gray-100 dark:border-[#2A2F3A] bg-white dark:bg-[#1A1F26] shadow-sm dark:shadow-none">
            <CardContent className="p-8">
              <div className="flex items-center gap-6 mb-8">
                <div className="w-20 h-20 bg-blue-50 dark:bg-[#2A2F3A] rounded-2xl flex items-center justify-center shrink-0 overflow-hidden border border-gray-100 dark:border-gray-800">
                   {selectedCompany.logoUrl ? (
                     <img src={selectedCompany.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                   ) : (
                     <Building2 className="text-blue-500" size={32} />
                   )}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-[#fafafa] flex items-center gap-2">
                    {selectedCompany.companyName}
                    <span className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full tracking-wider mt-1">Status Ativo</span>
                  </h2>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1.5"><Briefcase size={16}/> {selectedCompany.fleetName}</span>
                    <span className="flex items-center gap-1.5"><Gamepad2 size={16}/> {selectedCompany.simulatorName}</span>
                    <span className="flex items-center gap-1.5"><Users size={16}/> {selectedCompany.ownerName}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 dark:bg-[#09090b] p-4 rounded-2xl border border-gray-100 dark:border-[#2A2F3A]">
                  <p className="text-gray-500 dark:text-gray-400 text-[13px] font-medium flex items-center gap-2"><Users size={14} className="text-blue-500"/> Equipe Registrada</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{selectedCompany.totalEmployees}</p>
                </div>
                <div className="bg-gray-50 dark:bg-[#09090b] p-4 rounded-2xl border border-gray-100 dark:border-[#2A2F3A]">
                  <p className="text-gray-500 dark:text-gray-400 text-[13px] font-medium flex items-center gap-2"><Navigation size={14} className="text-green-500"/> Viagens Entregues</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{selectedCompany.totalTrips}</p>
                </div>
                <div className="bg-gray-50 dark:bg-[#09090b] p-4 rounded-2xl border border-gray-100 dark:border-[#2A2F3A]">
                  <p className="text-gray-500 dark:text-gray-400 text-[13px] font-medium flex items-center gap-2"><FileText size={14} className="text-purple-500"/> Total Contratos</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{selectedCompany.totalContracts}</p>
                </div>
                <div className="bg-gray-50 dark:bg-[#09090b] p-4 rounded-2xl border border-gray-100 dark:border-[#2A2F3A]">
                  <p className="text-gray-500 dark:text-gray-400 text-[13px] font-medium flex items-center gap-2"><Truck size={14} className="text-orange-500"/> Veículos na Frota</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{selectedCompany.totalVehicles}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-10">
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase px-1 border-b border-gray-100 dark:border-gray-800 pb-2">Informações Fiscais</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-sm px-1">
                      <span className="text-gray-500 dark:text-gray-400">CNPJ</span>
                      <span className="font-semibold text-gray-900 dark:text-white">{selectedCompany.cnpj}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm px-1">
                      <span className="text-gray-500 dark:text-gray-400">Data de Cadastro</span>
                      <span className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                         {new Date(selectedCompany.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm px-1">
                      <span className="text-gray-500 dark:text-gray-400">Proprietário (ID)</span>
                      <span className="font-semibold text-gray-900 dark:text-white text-[11px] font-mono">{selectedCompany.userId || 'N/A'}</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase px-1 border-b border-gray-100 dark:border-gray-800 pb-2">Métricas de Frota e Staff</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-sm px-1">
                      <span className="text-gray-500 dark:text-gray-400">Volume Transportado</span>
                      <span className="font-semibold text-gray-900 dark:text-white">{selectedCompany.totalDeliveries} <span className="text-[11px] text-gray-400">unids</span></span>
                    </div>
                    <div className="flex justify-between items-center text-sm px-1">
                      <span className="text-gray-500 dark:text-gray-400">Administradores</span>
                      <span className="font-semibold text-gray-900 dark:text-white">{selectedCompany.totalAdmins}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm px-1">
                      <span className="text-gray-500 dark:text-gray-400">Motoristas Qualificados</span>
                      <span className="font-semibold text-gray-900 dark:text-white">{selectedCompany.totalDrivers}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'requests' && (
        <div className="space-y-4 animate-in fade-in duration-300">
          {registrations.length === 0 ? (
            <div className="bg-white dark:bg-[#1A1F26] border border-gray-100 dark:border-[#2A2F3A] rounded-[24px] p-12 text-center shadow-sm dark:shadow-none">
              <CheckCircle2 size={48} className="mx-auto text-green-500 mb-4 opacity-50"/>
              <h3 className="text-gray-900 dark:text-[#fafafa] font-bold text-lg">Tudo limpo!</h3>
              <p className="text-gray-500 dark:text-[#a1a1aa] mt-2">Nenhuma solicitação de empresa aguardando aprovação.</p>
            </div>
          ) : (
            registrations.map((reg) => (
              <div
                key={reg.id}
                className="bg-white dark:bg-[#1A1F26] border border-gray-100 dark:border-[#2A2F3A] rounded-[24px] p-6 shadow-sm dark:shadow-none flex flex-col md:flex-row gap-6 justify-between items-start md:items-center transition-all hover:border-blue-200 dark:hover:border-blue-500/30"
              >
                <div className="flex items-start gap-5 flex-1">
                  <div className="w-14 h-14 bg-blue-50 dark:bg-[#2A2F3A] rounded-2xl flex items-center justify-center shrink-0 border border-blue-100 dark:border-gray-800 overflow-hidden">
                    {reg.photoURL ? (
                      <img src={reg.photoURL} alt="" className="w-full h-full object-cover"/>
                    ) : (
                      <Building2 className="text-blue-600 dark:text-blue-400" size={28}/>
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-[18px] text-gray-900 dark:text-[#fafafa] flex items-center gap-2">
                      {reg.companyName}
                      <span className="bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full tracking-wider">Aguardando</span>
                    </h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2 text-[13px]">
                      <span className="text-gray-500 dark:text-[#a1a1aa] flex items-center gap-1.5"><Users size={14}/> {reg.ownerName}</span>
                      <span className="text-gray-500 dark:text-[#a1a1aa] flex items-center gap-1.5"><Gamepad2 size={14}/> {reg.simulatorName || 'ETS2'}</span>
                      <span className="text-gray-500 dark:text-[#a1a1aa] flex items-center gap-1.5"><FileText size={14}/> {reg.cnpj}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 w-full md:w-auto">
                  <Button
                    onClick={() => setConfirmRejectId(reg.id)}
                    variant="outline"
                    disabled={loadingAction}
                    className="flex-1 md:flex-none border-red-200 dark:border-red-500/30 text-red-600 hover:bg-red-50 dark:bg-red-500/10 dark:hover:bg-red-500/20 h-11 px-5 rounded-xl"
                  >
                    <XCircle size={18} className="mr-2" />
                    Recusar
                  </Button>
                  <Button
                    onClick={() => handleApprove(reg)}
                    disabled={loadingAction}
                    className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-700 text-white h-11 px-6 rounded-xl shadow-md shadow-blue-500/20"
                  >
                    <CheckCircle2 size={18} className="mr-2" />
                    Aprovar
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'approved' && (
        <div className="space-y-4 animate-in fade-in duration-300">
          {companyStats.length === 0 ? (
            <div className="bg-white dark:bg-[#1A1F26] border border-gray-100 dark:border-[#2A2F3A] rounded-[24px] p-12 text-center shadow-sm dark:shadow-none">
               <Building2 size={48} className="mx-auto text-gray-300 dark:text-gray-700 mb-4"/>
               <p className="text-gray-500 font-medium">Nenhuma empresa registrada.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               {companyStats.map(c => (
                 <div key={c.id} className="bg-white dark:bg-[#1A1F26] border border-gray-100 dark:border-[#2A2F3A] rounded-[24px] p-6 shadow-sm dark:shadow-none transition-all hover:shadow-md hover:border-gray-200 dark:hover:border-gray-700 group flex flex-col">
                    <div className="flex items-center gap-4 mb-3">
                       <div className="w-12 h-12 rounded-xl bg-gray-50 dark:bg-[#2A2F3A] border border-gray-100 dark:border-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
                           {c.logoUrl ? (
                             <img src={c.logoUrl} alt="" className="w-full h-full object-cover"/>
                           ) : (
                             <Building2 className="text-blue-500 shadow-none border-0" size={24}/>
                           )}
                       </div>
                       <div className="flex-1 min-w-0">
                         <h3 className="font-bold text-[16px] text-gray-900 dark:text-[#fafafa] truncate">{c.companyName}</h3>
                         <span className="text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400 px-2 py-0.5 rounded-full inline-flex mt-1 uppercase tracking-wider">
                           Ativa & Operante
                         </span>
                       </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400 mb-5 pb-4 border-b border-gray-100 dark:border-gray-800">
                      <span className="flex items-center gap-1"><Gamepad2 size={12}/> {c.simulatorName || 'ETS2'}</span>
                      <span className="flex items-center gap-1"><Users size={12}/> {c.ownerName}</span>
                      <span className="flex items-center gap-1 w-full mt-1 border-t border-gray-50 dark:border-gray-800 pt-2 text-gray-400">
                         {c.ownerEmail || 'N/A'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-auto">
                       <div>
                         <p className="text-gray-500 text-[11px] font-bold uppercase mb-1 flex items-center gap-1.5"><Users size={12}/> Equipe</p>
                         <p className="font-semibold text-gray-900 dark:text-white text-[15px]">{c.totalEmployees} <span className="text-gray-400 text-xs font-normal">membros</span></p>
                       </div>
                       <div>
                         <p className="text-gray-500 text-[11px] font-bold uppercase mb-1 flex items-center gap-1.5"><Truck size={12}/> Motoristas</p>
                         <p className="font-semibold text-gray-900 dark:text-white text-[15px]">{c.totalDrivers} <span className="text-gray-400 text-xs font-normal">ativos</span></p>
                       </div>
                       <div>
                         <p className="text-gray-500 text-[11px] font-bold uppercase mb-1 flex items-center gap-1.5"><FileText size={12}/> Contratos</p>
                         <p className="font-semibold text-gray-900 dark:text-white text-[15px]">{c.totalContracts}</p>
                       </div>
                       <div>
                         <p className="text-gray-500 text-[11px] font-bold uppercase mb-1 flex items-center gap-1.5"><Navigation size={12}/> Viagens</p>
                         <p className="font-semibold text-gray-900 dark:text-white text-[15px]">{c.totalTrips}</p>
                       </div>
                    </div>

                    <div className="flex gap-2 mt-6">
                      <Button 
                        onClick={() => setConfirmDeleteId(c.id)}
                        disabled={loadingAction}
                        variant="ghost"
                        className="w-12 px-0 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-red-600 rounded-xl transition-colors shrink-0"
                        title="Remover empresa"
                      >
                        <XCircle size={18}/>
                      </Button>
                      <Button 
                        onClick={() => viewCompanyProfile(c.id)}
                        className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 dark:bg-[#09090b] dark:hover:bg-gray-800 dark:text-white rounded-xl shadow-none font-semibold transition-colors group-hover:bg-blue-50 group-hover:text-blue-600 dark:group-hover:text-blue-400"
                      >
                        Acessar Painel <ArrowRight size={16} className="ml-2"/>
                      </Button>
                    </div>
                 </div>
               ))}
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modals */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#1A1F26] rounded-[24px] p-6 w-full max-w-sm shadow-xl flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white pb-2 border-b border-gray-100 dark:border-gray-800 mb-3">Remover Empresa</h3>
              <p className="text-[14px] text-gray-500 dark:text-gray-400">
                ATENÇÃO: Você tem certeza que deseja remover esta empresa permanentemente? Todos os vínculos associados a ela perderão referência à empresa.
              </p>
            </div>
            <div className="flex gap-3 justify-end mt-2">
              <Button onClick={() => setConfirmDeleteId(null)} variant="outline" disabled={loadingAction} className="h-10 text-sm">
                Cancelar
              </Button>
              <Button onClick={() => handleDeleteCompany(confirmDeleteId)} disabled={loadingAction} className="h-10 text-sm bg-red-600 hover:bg-red-700 text-white border-0 shadow-sm">
                Confirmar Remoção
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmRejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#1A1F26] rounded-[24px] p-6 w-full max-w-sm shadow-xl flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white pb-2 border-b border-gray-100 dark:border-gray-800 mb-3">Recusar Solicitação</h3>
              <p className="text-[14px] text-gray-500 dark:text-gray-400">
                Deseja recusar e excluir esta solicitação?
              </p>
            </div>
            <div className="flex gap-3 justify-end mt-2">
              <Button onClick={() => setConfirmRejectId(null)} variant="outline" disabled={loadingAction} className="h-10 text-sm">
                Cancelar
              </Button>
              <Button onClick={() => handleReject(confirmRejectId)} disabled={loadingAction} className="h-10 text-sm bg-red-600 hover:bg-red-700 text-white border-0 shadow-sm">
                Recusar
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
