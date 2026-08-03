# 🎱 Neon Bingo — Real-Time Multiplayer Bingo Platform

A production-ready, full-stack web-based Bingo gaming platform featuring real-time WebSocket gameplay, admin control panel, referral system, wallet management, adjustable win rates (RTP), and AI bots.

---

## 🚀 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 15, React, Tailwind CSS v4, Framer Motion, Lucide Icons |
| **Backend** | Node.js, Express, Socket.IO, TypeScript |
| **Database** | PostgreSQL 15 + Prisma ORM |
| **Auth** | JWT (JSON Web Tokens), bcryptjs |
| **Realtime** | Socket.IO (WebSocket transport) |
| **Deployment** | Docker, Docker Compose, Vercel-ready |

---

## 📁 Project Structure

```
Bingo-Web/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma          # Database schema
│   ├── src/
│   │   ├── controllers/           # REST API handlers
│   │   │   ├── authController.ts
│   │   │   ├── walletController.ts
│   │   │   ├── referralController.ts
│   │   │   └── adminController.ts
│   │   ├── engine/                # Game logic
│   │   │   ├── BingoEngine.ts     # Room management, game ticks, bot AI
│   │   │   ├── ProbabilityEngine.ts # RTP bias, win-rate controller
│   │   │   └── socketHandler.ts   # Socket.IO event routing
│   │   ├── middlewares/
│   │   │   ├── auth.ts            # JWT middleware
│   │   │   └── rateLimiter.ts     # Request throttling
│   │   ├── utils/
│   │   │   └── settings.ts        # Dynamic admin settings loader
│   │   ├── db.ts                  # Prisma client export
│   │   └── server.ts              # Express + Socket.IO bootstrap
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx           # Landing page
│   │   │   ├── login/page.tsx     # Login
│   │   │   ├── register/page.tsx  # Registration
│   │   │   ├── dashboard/page.tsx # User dashboard
│   │   │   ├── lobby/page.tsx     # Game room browser
│   │   │   ├── wallet/page.tsx    # Deposits & withdrawals
│   │   │   ├── referral/page.tsx  # Referral program
│   │   │   ├── admin/page.tsx     # Admin control panel
│   │   │   ├── play/[roomId]/page.tsx # Live Bingo game room
│   │   │   ├── layout.tsx         # Root layout
│   │   │   └── globals.css        # Neon theme styles
│   │   ├── components/
│   │   │   └── Navbar.tsx         # Navigation bar
│   │   └── context/
│   │       ├── AuthContext.tsx     # Authentication state
│   │       └── SocketContext.tsx   # WebSocket game state
│   ├── Dockerfile
│   ├── .env.local
│   └── package.json
└── docker-compose.yml
```

---

## ⚡ Quick Start (Local Development)

### Prerequisites

- **Node.js** v18+ and npm
- **PostgreSQL** 15+ (running locally or via Docker)

### 1. Clone and Install

```bash
git clone <repo-url> && cd Bingo-Web

# Backend
cd backend && npm install
npx prisma generate

# Frontend
cd ../frontend && npm install
```

### 2. Configure Environment

**Backend** (`backend/.env`):
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/bingo_db?schema=public"
JWT_SECRET="your-secret-key-here"
PORT=5000
FRONTEND_URL="http://localhost:3000"
```

**Frontend** (`frontend/.env.local`):
```env
NEXT_PUBLIC_API_URL="http://localhost:5000/api"
NEXT_PUBLIC_SOCKET_URL="http://localhost:5000"
```

### 3. Set Up Database

```bash
cd backend

# Create database tables
npx prisma db push

# (Optional) Open Prisma Studio to inspect data
npx prisma studio
```

### 4. Start Development Servers

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000/api
- **Prisma Studio**: http://localhost:5555 (if launched)

---

## 🐳 Docker Deployment

### Full Stack (One Command)

```bash
docker-compose up --build -d
```

This launches:
- **PostgreSQL** on port `5432`
- **Backend API + Socket.IO** on port `5000`
- **Next.js Frontend** on port `3000`

### Stop Services

```bash
docker-compose down
```

### Reset Database

```bash
docker-compose down -v   # removes volumes (data)
docker-compose up --build -d
```

---

## 🔑 Default Admin Credentials

The backend auto-seeds a Super Admin on first startup:

| Field | Value |
|---|---|
| **Email** | `admin@bingo.com` |
| **Password** | `admin12345` |

> ⚠️ **Change these credentials immediately in production!**

---

## 🎮 Features

### Player Features
- **Registration & Login** — JWT-authenticated sessions, welcome bonus ($10.00)
- **Game Lobby** — Browse Free, Paid, and Tournament rooms with live player counts
- **Live Bingo Room** — Real-time number calls via WebSocket, manual/auto-daub, BINGO claim with anti-cheat validation
- **Voice Announcements** — Browser Speech API calls out B-I-N-G-O numbers
- **Wallet System** — Deposit (with TX hash), withdraw (pending admin approval), full transaction ledger
- **Referral Program** — Unique invite code, $5.00 flat bonus per signup, 10% lifetime commission on entry fees
- **Leaderboard** — Top referrers ranked by earnings

### Admin Features
- **Game Configuration** — Adjust win rate %, RTP %, jackpot chance, call speed, bonus amounts
- **Financial Control** — Approve/reject deposits and withdrawals
- **User Management** — View all users, ban/unban, manual wallet balance adjustments
- **Analytics Dashboard** — Total deposits vs withdrawals, house revenue, human vs bot win ratios

### Game Engine
- **AI Bots** — Auto-spawned to fill rooms, with server-side auto-daubing
- **Probability Engine** — Dynamically biases number calls to match target win rates (human vs bot)
- **12 Win Patterns** — 5 rows, 5 columns, 2 diagonals
- **Anti-Cheat** — Server validates all daubs match called numbers before accepting BINGO claims

---

## 🏗️ Architecture

```
┌─────────────┐     REST + WS     ┌──────────────┐     Prisma     ┌────────────┐
│   Next.js   │ ◄──────────────► │   Express    │ ◄────────────► │ PostgreSQL │
│  Frontend   │                   │  + Socket.IO │                │  Database  │
│  (Port 3000)│                   │  (Port 5000) │                │ (Port 5432)│
└─────────────┘                   └──────────────┘                └────────────┘
                                        │
                                  ┌─────┴──────┐
                                  │ BingoEngine│
                                  │ + Prob.Eng.│
                                  └────────────┘
```

---

## 📊 Database Models

| Model | Purpose |
|---|---|
| `User` | Player accounts, roles, referral links |
| `Wallet` | Balance, total winnings, referral earnings |
| `Transaction` | Full financial ledger |
| `BingoRoom` | Room configs (type, entry fee, prize pool) |
| `BingoGame` | Game sessions with called numbers, winner |
| `GameParticipant` | Players per game (human + bot) |
| `BingoCard` | 5×5 grids with daub state |
| `ReferralEarning` | Commission transaction logs |
| `DepositRequest` | Pending/approved/rejected deposits |
| `WithdrawalRequest` | Pending/approved/rejected withdrawals |
| `AdminSetting` | Dynamic key-value config store |
| `Notification` | In-app user notifications |
| `AdminActivityLog` | Admin action audit trail |
| `DailyBonusLog` | Daily bonus claim tracking |

---

## 🔒 Security

- Password hashing with **bcryptjs** (10 salt rounds)
- JWT tokens with configurable secret and expiry
- Rate limiting on all API endpoints
- Admin routes protected by role-based middleware
- Anti-cheat validation on all BINGO claims
- CORS restricted to frontend origin

---

## 📝 API Endpoints

### Auth
| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | No | Create account |
| POST | `/api/auth/login` | No | Login |
| GET | `/api/auth/profile` | JWT | Get user profile + wallet |

### Wallet
| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/wallet/info` | JWT | Get wallet balance |
| POST | `/api/wallet/deposit` | JWT | Submit deposit request |
| POST | `/api/wallet/withdraw` | JWT | Submit withdrawal request |
| GET | `/api/wallet/transactions` | JWT | Transaction history |
| GET | `/api/wallet/deposits` | JWT | Deposit history |
| GET | `/api/wallet/withdrawals` | JWT | Withdrawal history |

### Referrals
| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/referrals/stats` | JWT | Referral stats + earnings |
| GET | `/api/referrals/leaderboard` | JWT | Top referrers |

### Rooms
| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/rooms` | No | List all rooms with live stats |

### Admin
| Method | Route | Auth | Description |
|---|---|---|---|
| GET/POST | `/api/admin/settings` | Admin | Get/update game settings |
| GET | `/api/admin/stats` | Admin | Platform analytics |
| GET | `/api/admin/users` | Admin | User list |
| POST | `/api/admin/users/ban` | Admin | Toggle user ban |
| POST | `/api/admin/users/wallet` | Admin | Adjust user balance |
| GET | `/api/admin/deposits` | Admin | Pending deposits |
| POST | `/api/admin/deposits/approve` | Admin | Approve deposit |
| POST | `/api/admin/deposits/reject` | Admin | Reject deposit |
| GET | `/api/admin/withdrawals` | Admin | Pending withdrawals |
| POST | `/api/admin/withdrawals/approve` | Admin | Approve withdrawal |
| POST | `/api/admin/withdrawals/reject` | Admin | Reject withdrawal |

### Socket.IO Events
| Event | Direction | Description |
|---|---|---|
| `join_room` | Client → Server | Join a bingo room |
| `leave_room` | Client → Server | Leave current room |
| `daub_number` | Client → Server | Mark a number on card |
| `claim_bingo` | Client → Server | Claim BINGO win |
| `send_chat` | Client → Server | Send chat message |
| `room_update` | Server → Client | Room state broadcast |
| `room_countdown` | Server → Client | Countdown tick |
| `game_started` | Server → Client | Game begins + cards dealt |
| `number_called` | Server → Client | New number called |
| `game_finished` | Server → Client | Winner announced |
| `chat_message` | Server → Client | Chat message broadcast |

---

## 🌐 Deployment Options

### Vercel (Frontend)
1. Push `frontend/` to a Git repository
2. Import project in Vercel
3. Set environment variables in Vercel dashboard
4. Deploy

### VPS (Full Stack)
1. Install Docker and Docker Compose on VPS
2. Clone repository
3. Update `.env` files with production values
4. Run `docker-compose up --build -d`
5. Set up reverse proxy (nginx) for domains

---

## 📜 License

This project is proprietary. All rights reserved.
