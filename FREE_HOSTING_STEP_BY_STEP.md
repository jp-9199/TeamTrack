# 🚀 TeamTrack 100% Free 24/7 Cloud Deployment Guide (Zero Credit Card)

Yeh guide aapko TeamTrack ko internet par 24/7 live karne ka mukammal tareeqa batati hai **bina kisi credit card** ke.

Hum 3 best free platforms use karenge jo GitHub account se direct connect hotay hain:
1. **Database**: [Supabase](https://supabase.com) (100% Free PostgreSQL, No Card)
2. **Backend & Realtime WebSockets**: [Render](https://dashboard.render.com) (Free Web Service Tier, No Card required jab Free plan select karein) ya [Back4App Containers](https://www.back4app.com)
3. **Frontend**: [Vercel](https://vercel.com) (100% Free Next.js Global Hosting, No Card)

---

## 📋 Step 1: Database Setup on Supabase (2 Minutes)

1. **Sign Up**:
   - Open [https://supabase.com](https://supabase.com)
   - Click **"Start your project"** aur **"Sign in with GitHub"** karein (Koi card nahi maangta).

2. **Create New Project**:
   - Click **"New project"**
   - **Name**: `teamtrack-db`
   - **Database Password**: Aik strong password rakhein (e.g. `TeamTrackSecure2026!`). **(Is password ko yaad rakhein)**
   - **Region**: Closest region choose karein (e.g. `Singapore` ya `Frankfurt`).
   - **Pricing Plan**: Free Tier ($0).
   - Click **"Create new project"** (Yeh 1-2 minutes me ready ho jata hai).

3. **Database Schema Run Karein**:
   - Supabase dashboard me left menu se **"SQL Editor"** par click karein.
   - **"New query"** par click karein.
   - Apne project ki file [`database/init_supabase_schema.sql`](./database/init_supabase_schema.sql) ka poora text copy karein aur SQL Editor me paste kar dein.
   - Niche **"Run"** button dabayein.
   - ✅ *Result*: 3 seconds me aapke saray 23 database tables, security tables, indexes aur triggers create ho jayenge!

4. **Connection String Copy Karein**:
   - Left menu me **Project Settings** (gear icon ⚙️) -> **Database** par jayein.
   - Niche scroll karke **"Connection string"** section me **"URI"** tab select karein.
   - Mode me **"Transaction"** ya **"Session"** copy karein:
     `postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres`
   - `[YOUR-PASSWORD]` ki jagah apna set kiya hua password likhein.
   - Yeh aapka **DATABASE_URL** ban gaya!

---

## 🖥️ Step 2: Backend & WebSockets Live Karein (Render Free Web Service)

Render Web Service free tier par Node.js aur WebSockets dono ko 24/7 support karta hai:

1. **Sign In**:
   - Open [https://dashboard.render.com](https://dashboard.render.com)
   - **"Sign in with GitHub"** karein.

2. **Create Web Service**:
   - Click **"New +"** (top right) -> **"Web Service"**.
   - **"Build and deploy from a Git repository"** select karke Next karein.
   - Apna repository select karein: `jp-9199/TeamTrack` (Connect karein).

3. **Configure Settings**:
   - **Name**: `teamtrack-backend`
   - **Region**: Same as database (e.g. Frankfurt ya Singapore)
   - **Branch**: `main`
   - **Root Directory**: *(Khali chor dein)*
   - **Runtime**: `Node`
   - **Build Command**:
     ```bash
     npm ci && npm run build:packages && npm run --workspace=@teamtrack/backend build
     ```
   - **Start Command**:
     ```bash
     npm run --workspace=@teamtrack/backend migrate && node services/backend/dist/server.js
     ```
   - **Instance Type**: ⚠️ **IMPORTANT**: Radio button me **Free ($0 / month)** select karein! *(Agar "Starter" par click hoga toh card maangega, isliye "Free" select karein)*.

4. **Environment Variables Add Karein**:
   Niche **"Environment Variables"** section me yeh keys add karein:

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `PORT` | `10000` |
   | `DATABASE_URL` | *(Supabase wali connection string jo Step 1 me copy ki thi)* |
   | `DATABASE_SSL` | `true` |
   | `ACCESS_TOKEN_SECRET` | `teamtrack-super-production-token-secret-32-chars-minimum!` |
   | `REFRESH_TOKEN_SECRET` | `teamtrack-super-production-refresh-secret-32-chars-minimum!` |
   | `CORS_ORIGIN` | `*` |
   | `ALLOW_MEMORY_FALLBACK` | `true` |
   | `ALLOW_MOCK_STORAGE` | `true` |

5. **Deploy**:
   - Click **"Create Web Service"**.
   - Render aapke backend ko build karke live kar dega.
   - Jab status **"Live"** ho jaye, toh top par diya gaya URL copy kar lein:
     Maslan: `https://teamtrack-backend-xxxx.onrender.com`

---

## 🌐 Step 3: Frontend Live Karein (Vercel) (1 Minute)

1. **Sign In**:
   - Open [https://vercel.com](https://vercel.com)
   - **"Continue with GitHub"** karein (Koi card nahi chahiye).

2. **Import Project**:
   - Click **"Add New..."** -> **"Project"**.
   - Apna repository search karein: `TeamTrack` aur **"Import"** dabayein.

3. **Configure Project**:
   - **Framework Preset**: `Next.js` (Already auto-detected).
   - **Root Directory**: `.` (Monorepo root - default).
   - **Build Command**: `npm run build:web` (Vercel.json already configured).
   - **Environment Variables**:
     Add 2 simple variables:
     * `NEXT_PUBLIC_API_URL`:
       `https://teamtrack-backend-xxxx.onrender.com/api/v1`
       *(Render wala backend URL + `/api/v1`)*
     * `NEXT_PUBLIC_WS_URL`:
       `wss://teamtrack-backend-xxxx.onrender.com/ws`
       *(Render wala backend URL lekin `https://` ki jagah `wss://` aur aakhir me `/ws`)*

4. **Deploy**:
   - Click **"Deploy"**.
   - 60 seconds me Next.js globally deploy ho jayega!
   - Aapko free official domain mil jayega: `https://teamtrack-xxxx.vercel.app`.

---

## 🎯 Verification & Testing

Aapka TeamTrack ab worldwide 24/7 internet par live hai!
1. Vercel wala link open karein: `https://teamtrack-xxxx.vercel.app`.
2. Welcome screen par **"Sign Up"** karke account banayein (ya test user create karein).
3. Doosri browser window (ya mobile) me doosra account banayein.
4. Voice call, video call, screen share aur instant chat test karein!

Har bar jab aap local machine se GitHub par code push karenge (`git push origin main`):
* Vercel aur Render **automatically** latest code se update ho jayenge (Zero Downtime CI/CD)!
