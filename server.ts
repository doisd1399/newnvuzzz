import express from "express";
import path from "path";
import multer from "multer";
import { google } from "googleapis";
import { createServer as createViteServer } from "vite";
import fs from "fs";

// Initialize Firebase Admin SDK
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use a temporary folder for uploads
  const upload = multer({ dest: "uploads/" });

  // Google OAuth Client
  const getGoogleOAuthClient = () => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ||
      `${process.env.APP_URL || "http://localhost:3000"}/api/drive/callback`;
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  };

  app.get("/api/debug-routes", (req, res) => {
    res.json({
      version: "NVU-GDRIVE-V2",
      uploadRouteExists: true,
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/drive/auth", (req, res) => {
    const oauth2Client = getGoogleOAuthClient();
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: ["https://www.googleapis.com/auth/drive.file"],
    });
    res.redirect(url);
  });

  app.get("/api/drive/callback", async (req, res) => {
    try {
      const code = req.query.code as string;
      if (!code) throw new Error("No code provided");

      const oauth2Client = getGoogleOAuthClient();
      const { tokens } = await oauth2Client.getToken(code);

      // We will send the tokens back to the window opener (the SeniorPanel)
      // so it can save the refreshToken in Firestore.
      res.send(`
        <html>
          <body>
            <script>
              window.opener.postMessage({ 
                type: 'google-oauth-success', 
                refreshToken: '${tokens.refresh_token}' 
              }, '*');
              window.close();
            </script>
            Autenticação concluída! Fechando janela...
          </body>
        </html>
      `);
    } catch (err: any) {
      res.status(500).send(`Erro na autenticação: ${err.message}`);
    }
  });

  app.post("/api/upload-drive", upload.single("image"), async (req, res) => {
    try {
      console.log("[Google Drive Upload] - Recebendo requisição...");
      console.log("[Google Drive Upload] - companyId:", req.body.companyId);
      console.log("[Google Drive Upload] - arquivo recebido:", !!req.file);

      // Fetch refresh token from Firestore using admin SDK
      const sysDocSnap = await db.collection("settings").doc("system").get();
      const refreshToken = sysDocSnap.data()?.driveRefreshToken;

      console.log(
        "[Google Drive Upload] - Token encontrado no Firestore:",
        !!refreshToken,
      );

      if (!refreshToken) {
        return res.status(401).json({
          error:
            "O Google Drive não está conectado pelo proprietário do sistema.",
        });
      }

      const oauth2Client = getGoogleOAuthClient();
      oauth2Client.setCredentials({ refresh_token: refreshToken });

      const drive = google.drive({ version: "v3", auth: oauth2Client });

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const PARENT_FOLDER_ID = "1pJxzl5y1pre-qxkMb7kJIo8x7cFUso4U";
      const companyId = req.body.companyId || "Geral";

      // 1. Check if folder for this company exists inside PARENT_FOLDER_ID
      let targetFolderId = PARENT_FOLDER_ID;
      try {
        const query = `mimeType='application/vnd.google-apps.folder' and name='${companyId.replace(/'/g, "\\'")}' and '${PARENT_FOLDER_ID}' in parents and trashed=false`;
        const resList = await drive.files.list({
          q: query,
          fields: "files(id, name)",
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });

        if (resList.data.files && resList.data.files.length > 0) {
          targetFolderId = resList.data.files[0].id!;
          console.log(
            "[Google Drive Upload] - Pasta encontrada para empresa:",
            companyId,
            "ID:",
            targetFolderId,
          );
        } else {
          // 2. Create the subfolder if it does not exist
          const folderMetadata = {
            name: companyId,
            mimeType: "application/vnd.google-apps.folder",
            parents: [PARENT_FOLDER_ID],
          };
          const folderRes = await drive.files.create({
            requestBody: folderMetadata,
            fields: "id",
            supportsAllDrives: true,
          });
          targetFolderId = folderRes.data.id!;
          console.log(
            "[Google Drive Upload] - Nova pasta criada para empresa:",
            companyId,
            "ID:",
            targetFolderId,
          );
        }
      } catch (folderErr) {
        console.warn(
          "[Google Drive Upload] - Could not find or create company subfolder, falling back to ROOT folder. Error:",
          folderErr,
        );
        targetFolderId = PARENT_FOLDER_ID;
      }

      const fileMetadata = {
        name: file.originalname,
        parents: [targetFolderId],
      };

      const media = {
        mimeType: file.mimetype,
        body: fs.createReadStream(file.path),
      };

      const driveRes = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: "id, webViewLink, webContentLink",
        supportsAllDrives: true,
      });

      // Provide read access to "anyone with the link" so frontend can show it
      try {
        await drive.permissions.create({
          fileId: driveRes.data.id!,
          requestBody: {
            role: "reader",
            type: "anyone",
          },
          supportsAllDrives: true,
        });
      } catch (permErr) {
        console.warn(
          "Could not set public permission. Display might fail if service account cannot share files.",
          permErr,
        );
      }

      // Cleanup local temp file
      fs.unlink(file.path, () => {});

      console.log(
        "[Google Drive Upload] - Upload concluído com sucesso:",
        driveRes.data.webViewLink,
      );

      return res.json({
        id: driveRes.data.id,
        webViewLink: driveRes.data.webViewLink,
        webContentLink: driveRes.data.webContentLink,
      });
    } catch (err: any) {
      console.error("Error uploading to drive:", err);
      // Cleanup local temp file if it exists
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(500).json({ error: err.message || "Failed to upload" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Express Error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Internal Server Error" });
    }
  });
}

startServer();
