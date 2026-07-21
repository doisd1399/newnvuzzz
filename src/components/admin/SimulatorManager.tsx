import React, {useState} from "react";
import {useAppStore} from "../../context/AppContext";
import {db} from "../../lib/firebase";
import {collection, doc, setDoc, updateDoc} from "firebase/firestore";
import {Card, CardContent} from "../ui/Card";

export default function SimulatorManager(){
 const {simulators=[]}=useAppStore();
 const [name,setName]=useState("");
 const [editingId,setEditingId]=useState<string|null>(null);
 const create=async()=>{
 const clean=name.trim(); if(!clean)return;
 const id=clean.toLowerCase().replace(/\s+/g,"-");
 if(editingId){
  await updateDoc(doc(db,"simulators",editingId),{name:clean,updatedAt:new Date().toISOString()});
  setEditingId(null);
 } else {
  await setDoc(doc(db,"simulators",id),{id,name:clean,active:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
 }
 setName("");
};
 const toggle=async(s:any)=>updateDoc(doc(db,"simulators",s.id),{active:!s.active,updatedAt:new Date().toISOString()});
 return <Card><CardContent className="p-6 space-y-4"><h3 className="font-bold">Gerenciar Simuladores</h3><div className="flex gap-2"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Nome do simulador" className="border p-2 rounded"/><button onClick={create}>{editingId?"Salvar":"Criar"}</button></div>{simulators.map((s:any)=><div key={s.id} className="flex justify-between"><span>{s.name}</span><div className="flex gap-2"><button onClick={()=>{setEditingId(s.id);setName(s.name)}}>Editar</button><button onClick={()=>toggle(s)}>{s.active?"Desativar":"Ativar"}</button></div></div>)}</CardContent></Card>
}
