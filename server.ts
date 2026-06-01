import express from "express";
import path from "path";
import multer from "multer";
import { google } from "googleapis";
import { createServer as createViteServer } from "vite";
import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use a temporary folder for uploads
  const upload = multer({ dest: "uploads/" });

  // Google OAuth Client
  const getGoogleOAuthClient = () => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL || "http://localhost:3000"}/api/drive/callback`;
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  };

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
      // Expecting refresh_token in request body
      const refreshToken = req.body.refreshToken;
      
      if (!refreshToken) {
        return res.status(401).json({ 
          error: "O Google Drive não está conectado pelo proprietário do sistema." 
        });
      }

      const oauth2Client = getGoogleOAuthClient();
      oauth2Client.setCredentials({ refresh_token: refreshToken });

      const drive = google.drive({ version: "v3", auth: oauth2Client });


      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      // 1pJxzl5y1pre-qxkMb7kJIo8x7cFUso4U
      const folderId = "1pJxzl5y1pre-qxkMb7kJIo8x7cFUso4U";

      const fileMetadata = {
        name: file.originalname,
        parents: [folderId],
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
          console.warn("Could not set public permission. Display might fail if service account cannot share files.", permErr);
      }

      // Cleanup local temp file
      fs.unlink(file.path, () => {});

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
