# Deployment Guide

This project utilizes a hybrid deployment model for 100% free hosting:
- **Backend (Node.js, Express, Socket.io):** Hosted dynamically via **GitHub Codespaces**.
- **Frontend (React, Vite):** Hosted permanently on **Vercel**.

*Note: Because the backend runs in a Codespace, it will only be active while your Codespace is running. This is perfect for zero-cost multiplayer sessions with friends.*

## 1. Starting the Backend in GitHub Codespaces

1. Go to your repository on GitHub.
2. Click the green **<> Code** button, select the **Codespaces** tab, and click **Create codespace on main**.
3. GitHub will build the container and automatically run `npm install`.
4. In the Codespace terminal, start the backend server:
   \`\`\`bash
   npm run start
   \`\`\`
5. Open the **Ports** tab (next to the Terminal tab at the bottom).
6. Verify that Port `4000` has its **Visibility** set to **Public**. (The `devcontainer.json` should do this automatically).
7. Right-click the **Forwarded Address** for Port `4000` and select **Copy Port Address** (it will look like `https://username-repo-id-4000.app.github.dev`).

## 2. Deploying the Frontend to Vercel

1. Create a [Vercel](https://vercel.com/) account and connect your GitHub repository.
2. Click **Add New** -> **Project** and import your repository.
3. Vercel will automatically set the Root Directory to `frontend`.
4. Open the **Environment Variables** section before clicking deploy:
   - Key: `VITE_BACKEND_URL`
   - Value: Paste the public Codespace URL you copied in Step 7. *(Make sure there is no trailing slash).*
5. Click **Deploy**.
6. **Copy the frontend URL** once the deployment succeeds.

## 3. Playing the Game

1. Your frontend is now permanently hosted on Vercel.
2. Whenever you want to play, simply open your GitHub Codespace and run `npm run start`.
3. As long as the Codespace is active and the port is public, players can visit your Vercel website and the game will function perfectly.
4. When you are done playing, stop the Codespace to save your free monthly usage hours.
