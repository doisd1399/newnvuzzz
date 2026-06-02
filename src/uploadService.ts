import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./lib/firebase";

export async function uploadFile(
  file: File,
  companyId: string,
  folder: string,
  userId: string
) {
  if (!file) throw new Error("Arquivo inválido");

  const filePath = `${companyId}/${folder}/${userId}/${Date.now()}_${file.name}`;

  const storageRef = ref(storage, filePath);

  const snapshot = await uploadBytes(storageRef, file);

  const url = await getDownloadURL(snapshot.ref);

  return {
    url,
    path: filePath,
  };
}
