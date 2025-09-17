# VakeelSaab Consultation ⚖️

A full-stack application that enables **lawyers and clients** to connect via **real-time peer-to-peer audio calls** using **WebRTC** and **Socket.io**.

This repo contains both the **frontend (React.js + Vite)** and **backend (Node.js + Express + Socket.io)**.

---

## 🚀 Features
- 👤 User authentication (Lawyer / Client roles)
- 🟢 User can see if a Lawyer is online or Busy
- 🔴 Lawyer can switch his/her status between Online and Busy
- ✉︎ Both Lawyer and user can do realtime chat
- 📞 Peer-to-peer audio calls using **WebRTC**
- ✅ Call Accept / Reject flow
- ⚡ React frontend with clean UI

---

## 📂 Project Structure
```
vakeelsaab-consultation/
│── client/          # React frontend (Vite)
│── server/          # Node.js backend (Express + Socket.io)
│── README.md
```

---

## ⚡ Getting Started

### 1️⃣ Clone Repo
```bash
git clone https://github.com/Kaushal-06/vakeelsaab-consultation.git
cd vakeelsaab-consultation
```

---

### 2️⃣ Setup Backend (Server)
```bash
cd server
npm install
node server.js
```
Server runs on: **http://localhost:3000**

---

### 3️⃣ Setup Frontend (Client)
```bash
cd client
npm install
npm run dev
```
Frontend runs on: **http://localhost:5173**

---

## 🔌 Tech Stack
- **Frontend:** React.js (Vite), TailwindCSS
- **Backend:** Node.js, Express.js, Socket.io
- **Real-time Communication:** WebRTC (peer-to-peer)

---

## 📞 Call Flow
1. **Client initiates a call** → Server signals lawyer via WebSocket.
2. **Lawyer sees incoming call** → Can Accept / Reject.
3. If **accepted**, a **WebRTC peer connection** is established.
4. Both client and lawyer can **talk in real-time**.

---

## 📌 Notes
- Both **client and server must run simultaneously**.

