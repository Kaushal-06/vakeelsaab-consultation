// server.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const bcrypt = require("bcrypt");
const url = require("url");

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// JWT Secret
const JWT_SECRET = "VakeelSaab@06$";

// In-memory data storage
const users = new Map(); // username -> user object
const connectedClients = new Map(); // username -> websocket connection

// Helper functions
const generateToken = (user) => {
  return jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, {
    expiresIn: "24h",
  });
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

const getOnlineLawyers = () => {
  const lawyers = [];
  for (const [username, user] of users.entries()) {
    if (user.role === "LAWYER" && connectedClients.has(username)) {
      lawyers.push({
        username: user.username,
        status: user.status || "ONLINE",
      });
    }
  }
  return lawyers;
};

const broadcastUserList = () => {
  const lawyers = getOnlineLawyers();
  const message = JSON.stringify({
    type: "user_list",
    lawyers: lawyers,
  });

  for (const [username, ws] of connectedClients.entries()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
};

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }

  req.user = decoded;
  next();
};

// Routes

// Register endpoint
app.post("/register", async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
      return res
        .status(400)
        .json({ error: "Username, password and role are required" });
    }

    if (!["CLIENT", "LAWYER"].includes(role)) {
      return res.status(400).json({ error: "Role must be CLIENT or LAWYER" });
    }

    if (users.has(username)) {
      return res.status(400).json({ error: "Username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = {
      username,
      password: hashedPassword,
      role,
      status: role === "LAWYER" ? "ONLINE" : null,
    };

    users.set(username, user);

    const token = generateToken(user);

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Login endpoint
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Username and password are required" });
    }

    const user = users.get(username);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = generateToken(user);

    res.json({
      message: "Login successful",
      token,
      user: {
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Lawyer status update endpoint
app.post("/lawyers/status", authenticateToken, (req, res) => {
  try {
    const { status } = req.body;

    if (req.user.role !== "LAWYER") {
      return res.status(403).json({ error: "Only lawyers can update status" });
    }

    if (!["ONLINE", "BUSY"].includes(status)) {
      return res.status(400).json({ error: "Status must be ONLINE or BUSY" });
    }

    const user = users.get(req.user.username);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.status = status;
    users.set(req.user.username, user);

    // Broadcast updated user list
    broadcastUserList();

    res.json({ message: "Status updated successfully", status });
  } catch (error) {
    console.error("Status update error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "Server is running" });
});

// WebSocket server
const wss = new WebSocket.Server({
  server,
  path: "/ws",
});

wss.on("connection", (ws, req) => {
  const query = url.parse(req.url, true).query;
  const token = query.token;

  if (!token) {
    ws.close(1008, "Token required");
    return;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    ws.close(1008, "Invalid token");
    return;
  }

  const username = decoded.username;
  connectedClients.set(username, ws);

  console.log(`User ${username} connected`);

  // Send initial user list
  ws.send(
    JSON.stringify({
      type: "user_list",
      lawyers: getOnlineLawyers(),
    })
  );

  // Broadcast updated user list to all clients
  broadcastUserList();

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case "message":
          // Handle chat messages
          const targetWs = connectedClients.get(message.to);
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(
              JSON.stringify({
                type: "message",
                from: username,
                message: message.message,
                timestamp: new Date().toISOString(),
              })
            );
          }
          break;

        case "call_request":
          // Handle call requests
          const lawyerWs = connectedClients.get(message.to);
          if (lawyerWs && lawyerWs.readyState === WebSocket.OPEN) {
            lawyerWs.send(
              JSON.stringify({
                type: "call_request",
                from: username,
              })
            );

            // Set lawyer status to BUSY
            const lawyer = users.get(message.to);
            if (lawyer) {
              lawyer.status = "BUSY";
              broadcastUserList();
            }
          }
          break;

        case "call_accept":
          // Handle call acceptance
          const clientWs = connectedClients.get(message.to);
          if (clientWs && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(
              JSON.stringify({
                type: "call_accepted",
                from: username,
              })
            );
          }
          break;

        case "call_end":
          // Handle call end
          const otherUserWs = connectedClients.get(message.to);
          if (otherUserWs && otherUserWs.readyState === WebSocket.OPEN) {
            otherUserWs.send(
              JSON.stringify({
                type: "call_ended",
                from: username,
              })
            );
          }

          // Reset lawyer status to ONLINE if they were the one ending the call
          const user = users.get(username);
          if (user && user.role === "LAWYER") {
            user.status = "ONLINE";
            broadcastUserList();
          }
          break;

        case "offer":
        case "answer":
        case "ice-candidate":
          // Handle WebRTC signaling
          const peerWs = connectedClients.get(message.to);
          if (peerWs && peerWs.readyState === WebSocket.OPEN) {
            peerWs.send(
              JSON.stringify({
                ...message,
                from: username,
              })
            );
          }
          break;

        default:
          console.log("Unknown message type:", message.type);
      }
    } catch (error) {
      console.error("Message handling error:", error);
    }
  });

  ws.on("close", () => {
    console.log(`User ${username} disconnected`);
    connectedClients.delete(username);

    // Reset lawyer status if they disconnect
    const user = users.get(username);
    if (user && user.role === "LAWYER") {
      user.status = "ONLINE";
    }

    // Broadcast updated user list
    broadcastUserList();
  });

  ws.on("error", (error) => {
    console.error("WebSocket error for user", username, ":", error);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server available at ws://localhost:${PORT}/ws`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  server.close(() => {
    console.log("Server closed");
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully...");
  server.close(() => {
    console.log("Server closed");
  });
});

module.exports = { app, server };
