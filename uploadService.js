import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebaseConfig";

export async function uploadFile(file, empresaId, tipo = "geral", userId) {
  if (!file) throw new Error("Arquivo inválido");

  const fileName = `${Date.now()}-${file.name}`;

  const fileRef = ref(
    storage,
    `empresas/${empresaId}/${tipo}/${fileName}`
  );

  const snapshot = await uploadBytes(file, fileRef);

  const url = await getDownloadURL(snapshot.ref);

  return {
    url,
    path: snapshot.ref.fullPath,
    fileName,
    empresaId,
    tipo,
    userId
  };
}
