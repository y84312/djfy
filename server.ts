import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const REDIRECT_URI = `${APP_URL}/auth/callback`;

// Spotify Auth URL
app.get("/api/auth/url", (req, res) => {
  const scope = "user-read-private user-read-email user-library-read user-top-read";
  const params = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID!,
    scope: scope,
    redirect_uri: REDIRECT_URI,
  });
  res.json({ url: `https://accounts.spotify.com/authorize?${params.toString()}` });
});

// Spotify Callback
app.get("/auth/callback", async (req, res) => {
  const code = req.query.code as string;

  try {
    const response = await axios.post(
      "https://accounts.spotify.com/api/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: REDIRECT_URI,
      }),
      {
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
          ).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;

    // Set cookies for the client
    res.cookie("spotify_access_token", access_token, {
      httpOnly: false, // Accessible by client for simplicity in this demo
      secure: true,
      sameSite: "none",
      maxAge: expires_in * 1000,
    });

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error("Spotify Auth Error:", error.response?.data || error.message);
    res.status(500).send("Authentication failed");
  }
});

// Proxy for Spotify API to avoid CORS and handle token if needed
app.get("/api/spotify/*", async (req, res) => {
  const token = req.headers.authorization;
  const path = req.params[0];
  const query = new URLSearchParams(req.query as any).toString();

  try {
    const response = await axios.get(`https://api.spotify.com/v1/${path}?${query}`, {
      headers: { Authorization: token },
    });
    res.json(response.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: "Spotify API error" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
