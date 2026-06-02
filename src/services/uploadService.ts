import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "../lib/firebase";

export interface UploadOptions {
  file: File;
  companyId: string;
  userId: string;
  folder?: string;
  onProgress?: (progress: number) => void;
}

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

/**
 * Service to upload files to Firebase Storage with a standardized structure.
 */
export const uploadService = {
  /**
   * Uploads an image file to Firebase Storage.
   * 
   * @param options Upload options including file and path parameters
   * @returns Promise resolving to the public download URL of the uploaded file
   */
  async uploadImage({ file, companyId, userId, folder = "uploads", onProgress }: UploadOptions): Promise<string> {
    // 1. Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      throw new UploadError("Formato de arquivo inválido. Apenas JPG, PNG e WEBP são aceitos.");
    }

    // 2. Validate file size (5MB limit)
    const MAX_SIZE_MB = 5;
    const maxSize = MAX_SIZE_MB * 1024 * 1024;
    if (file.size > maxSize) {
      throw new UploadError(`Arquivo muito grande. O limite máximo é de ${MAX_SIZE_MB}MB.`);
    }

    // 3. Generate structured file path
    // Format: empresas / companyId / folder / userId / timestamp_filename
    const timestamp = Date.now();
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, ''); // Basic sanitization
    const path = `empresas/${companyId}/${folder}/${userId}/${timestamp}_${cleanFileName}`;

    // 4. Create storage reference
    const storageRef = ref(storage, path);

    // 5. Upload file
    const uploadTask = uploadBytesResumable(storageRef, file);

    // 6. Return a promise that resolves with the download URL
    return new Promise((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          // Calculate and report progress
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (onProgress) {
            onProgress(progress);
          }
        },
        (error) => {
          // Handle unsuccessful uploads
          console.error("Erro no upload para o Firebase:", error);
          reject(new UploadError("Falha ao enviar o arquivo. Tente novamente."));
        },
        async () => {
          // Handle successful uploads on complete
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(downloadURL);
          } catch (error) {
            console.error("Erro ao obter URL de download:", error);
            reject(new UploadError("Falha ao obter URL pública do arquivo."));
          }
        }
      );
    });
  }
};
