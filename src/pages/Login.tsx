import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../context/AppContext';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Package, Truck, ArrowRight, ShieldCheck } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, query, collection, where, getDocs, writeBatch } from 'firebase/firestore';

export default function Login() {
  const { setCurrentUser, currentUser, authInitialized, companies } = useAppStore();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSubscribeOptions, setShowSubscribeOptions] = useState(false);

  useEffect(() => {
     if (authInitialized && currentUser) {
       const dest = sessionStorage.getItem('loginRedirect');
       if (dest) {
          sessionStorage.removeItem('loginRedirect');
          navigate(dest, { replace: true });
          return;
       }

       // Check recruitment app to handle 'rejected' or 'pending' efficiently?
       // For now, if active, go to dashboard. Otherwise go to status.
       if (currentUser.status === 'active') {
          navigate('/select-profile', { replace: true });
       } else {
          // Send to RH/status page
          navigate('/status', { replace: true });
       }
     }
  }, [authInitialized, currentUser, navigate]);

  if (!authInitialized || (currentUser && !sessionStorage.getItem('loginRedirect'))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#18181b]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-800"></div>
      </div>
    );
  }

  const unifyUserDocument = async (user: any) => {
    const q = query(collection(db, 'users'), where('email', '==', user.email));
    const qs = await getDocs(q);
    
    let targetDocData: any = null;
    let docsToDelete: string[] = [];

    qs.docs.forEach(docSn => {
       const data = docSn.data();
       if (docSn.id !== user.uid) {
          docsToDelete.push(docSn.id);
          if (!targetDocData || (data.name && data.name !== 'Motorista')) {
              targetDocData = data;
          }
       } else {
          if (!targetDocData || (data.name && data.name !== 'Motorista')) {
              targetDocData = data;
          }
       }
    });

    if (!targetDocData) {
       const userDoc = await getDoc(doc(db, 'users', user.uid));
       if (userDoc.exists()) {
           targetDocData = userDoc.data();
       }
    }

    const isNewUser = !targetDocData;
    const finalRole = targetDocData?.role || 'driver';
    const currentRoles = targetDocData?.roles || (finalRole === 'admin' ? ['admin', 'driver'] : ['driver']);
    const finalStatus = finalRole === 'admin' ? 'active' : (targetDocData?.status || 'pending');
    let finalMemberships = targetDocData?.memberships || {};
    
    if (Object.keys(finalMemberships).length === 0 && targetDocData?.companyId) {
      finalMemberships[targetDocData.companyId] = {
        role: finalRole,
        roles: currentRoles,
        status: finalStatus
      };
    }

    const finalUserData = {
       ...targetDocData,
       id: user.uid,
       email: user.email,
       name: user.displayName || targetDocData?.name || user.email?.split('@')[0] || 'Usuário',
       photoURL: targetDocData?.photoURL || user.photoURL || targetDocData?.avatar || `https://i.pravatar.cc/150?u=${user.uid}`,
       avatar: targetDocData?.photoURL || user.photoURL || targetDocData?.avatar || `https://i.pravatar.cc/150?u=${user.uid}`,
       role: finalRole,
       roles: currentRoles,
       status: finalStatus,
       memberships: finalMemberships,
    };

    const batch = writeBatch(db);
    batch.set(doc(db, 'users', user.uid), finalUserData);

    for (const oldId of docsToDelete) {
        batch.delete(doc(db, 'users', oldId));
        // Migrate trabalhos for this oldId
        const trabalhosQ = query(collection(db, 'trabalhos'), where('motoristaId', '==', oldId));
        const trabalhosQs = await getDocs(trabalhosQ);
        trabalhosQs.forEach(docSnap => batch.update(docSnap.ref, { motoristaId: user.uid, driverId: user.uid }));
        
        const driverTrabalhosQ = query(collection(db, 'trabalhos'), where('driverId', '==', oldId));
        const driverTrabalhosQs = await getDocs(driverTrabalhosQ);
        driverTrabalhosQs.forEach(docSnap => batch.update(docSnap.ref, { motoristaId: user.uid, driverId: user.uid }));

        // Migrate company memberships for this oldId
        const membershipsQ = query(collection(db, 'companyMembers'), where('userId', '==', oldId));
        const membershipsQs = await getDocs(membershipsQ);
        membershipsQs.forEach(docSnap => batch.update(docSnap.ref, { userId: user.uid }));
    }

    try {
        await batch.commit();
    } catch (e) {
        console.error("Migration batch commit failed:", e);
        await setDoc(doc(db, 'users', user.uid), finalUserData);
    }

    return finalUserData;
  };

  const handleGoogleLogin = async (destination?: string) => {
    setLoading(true);
    setError('');
    const provider = new GoogleAuthProvider();
    try {
      if (destination) {
        sessionStorage.setItem('loginRedirect', destination);
      }
      const result = await signInWithPopup(auth, provider);
      const finalUserData = await unifyUserDocument(result.user);
      
      setCurrentUser(finalUserData as any);
      // Let useEffect handle navigation based on status or redirect
    } catch (err: any) {
      sessionStorage.removeItem('loginRedirect');
      console.error("Google Login Error:", err);
      if (err.code === 'auth/unauthorized-domain') {
        setError(`Erro: Domínio não autorizado. Adicione o domínio da aplicação atual nas configurações de "Authorized domains" da aba "Authentication > Settings" do seu Console do Firebase.`);
      } else if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        setError('Erro ao fazer login com Google: ' + err.message);
      }
    } finally {
      if (auth.currentUser) {
         // keep loading state if logged in successfully for smooth transition
      } else {
         setLoading(false);
      }
    }
  };

  const handleDriverSubscribe = () => {
    handleGoogleLogin('/apply');
  };

  const handleCompanySubscribe = () => {
    handleGoogleLogin('/register-company');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-sm">
         <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-[#fafafa] tracking-tight mb-2">NVU</h1>
            <p className="text-slate-500 dark:text-[#a1a1aa] text-sm font-medium">Gestão Operacional de Logística</p>
         </div>

         <Card className="rounded-3xl border border-slate-200/60 dark:border-[#2A2F3A] shadow-xl dark:shadow-none overflow-hidden bg-white dark:bg-[#1A1F26]">
            <CardContent className="p-8">
               <h2 className="text-lg font-bold text-slate-900 dark:text-[#fafafa] mb-6 text-center">Acesse sua conta</h2>

               {error && (
                  <div className="bg-red-50 dark:bg-red-500/10 border border-transparent dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-xl mb-6 text-center">
                     {error}
                  </div>
               )}

               <div className="space-y-4">
                  {!showSubscribeOptions ? (
                    <>
                      <Button 
                        onClick={() => handleGoogleLogin()} 
                        disabled={loading}
                        className="w-full h-12 bg-white dark:bg-[#27272a]/50 hover:bg-slate-50 dark:hover:bg-[#27272a] text-slate-700 dark:text-[#e4e4e7] border border-slate-200 dark:border-[#2A2F3A]/50 shadow-sm dark:shadow-none transition-all rounded-xl relative flex justify-center items-center"
                      >
                         {loading ? (
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-800 dark:border-slate-400"></div>
                         ) : (
                            <>
                               <svg className="w-5 h-5 absolute left-4" viewBox="0 0 24 24">
                                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                               </svg>
                               <span className="font-semibold text-[15px]">Entrar com Google</span>
                            </>
                         )}
                      </Button>

                      <div className="relative py-4 text-center">
                         <span className="w-full border-t border-slate-200 dark:border-[#2A2F3A] absolute top-1/2 left-0 -translate-y-1/2" />
                         <span className="bg-white dark:bg-[#1A1F26] px-3 relative text-[11px] font-bold text-slate-400 dark:text-[#71717a] uppercase tracking-widest">Acesso Corporativo</span>
                      </div>

                      <Button 
                        onClick={() => setShowSubscribeOptions(true)}
                        disabled={loading}
                        className="w-full h-12 bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-500 text-white shadow-md dark:shadow-none transition-all rounded-xl font-semibold text-[15px] flex items-center justify-center gap-2"
                      >
                         <ShieldCheck size={18} className="text-emerald-400 dark:text-white" />
                         Quero me inscrever
                      </Button>
                    </>
                  ) : (
                    <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
                      <Button 
                        onClick={handleDriverSubscribe}
                        className="w-full h-12 bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-500 text-white shadow-md dark:shadow-none transition-all rounded-xl font-semibold text-[15px] flex items-center justify-start px-5 gap-3"
                      >
                        <Truck size={20} className="text-emerald-400 dark:text-white" />
                        Inscrição para Motoristas
                        <ArrowRight size={18} className="ml-auto opacity-70" />
                      </Button>

                      <Button 
                        onClick={handleCompanySubscribe}
                        className="w-full h-12 bg-white dark:bg-[#27272a]/50 border border-slate-200 dark:border-[#2A2F3A]/50 hover:bg-slate-50 dark:hover:bg-[#27272a] text-slate-700 dark:text-[#e4e4e7] shadow-sm dark:shadow-none transition-all rounded-xl font-semibold text-[15px] flex items-center justify-start px-5 gap-3"
                      >
                        <Package size={20} className="text-blue-500 dark:text-blue-400" />
                        Cadastro de Empresa
                        <ArrowRight size={18} className="ml-auto opacity-70" />
                      </Button>

                      <div className="mt-4 text-center">
                        <button 
                          onClick={() => setShowSubscribeOptions(false)}
                          className="text-sm font-semibold text-slate-500 hover:text-slate-700 dark:text-[#a1a1aa] dark:hover:text-[#e4e4e7] transition-colors"
                        >
                          Voltar ao login
                        </button>
                      </div>
                    </div>
                  )}
               </div>
            </CardContent>
         </Card>
         
         <p className="text-center text-xs font-semibold text-slate-400 dark:text-[#71717a] mt-8">NVU © {new Date().getFullYear()} — Plataforma Operacional</p>
      </div>
    </div>
  );
}