import { useState } from "react";
import { uploadFile } from "./uploadService";

export default function TestUpload() {
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("");

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    try {
      setLoading(true);

      console.log("🚀 INICIANDO UPLOAD...");
      console.log("FILE:", file.name, file.size);

      const result = await uploadFile(
        file,
        "empresa-teste",
        "viagens",
        "user-teste"
      );

      console.log("✅ UPLOAD OK:", result);

      alert("Upload funcionando!");
    } catch (err) {
      console.error("❌ ERRO UPLOAD:", err);
      alert("Erro no upload");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h3>🧪 Teste Upload Firebase</h3>

      <input type="file" onChange={handleUpload} />

      {fileName && <p>📎 {fileName}</p>}

      {loading && <p>⏳ Enviando...</p>}
    </div>
  );
}
