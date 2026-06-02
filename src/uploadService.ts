import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./lib/firebase";

export async function uploadFile(
  file: File,
  companyId: string,
  folder: string,
  userId: string
) {
  if (!file) throw new Error("Arquivo inválido");

  // caminho no storage
  const filePath = `${companyId}/${folder}/${userId}/${Date.now()}_${file.name}`;

  const storageRef = ref(storage, filePath);

  // upload
  const snapshot = await uploadBytes(storageRef, file);

  // URL pública
  const downloadURL = await getDownloadURL(snapshot.ref);

  return {
    url: downloadURL,
    path: filePath,
  };
}
