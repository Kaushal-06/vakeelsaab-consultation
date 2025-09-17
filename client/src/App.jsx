import React, { useState, useEffect, useRef } from "react";
import {
  Phone,
  PhoneOff,
  Send,
  User,
  Shield,
  MessageCircle,
  Users,
  X,
  Check,
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const App = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [lawyers, setLawyers] = useState([]);
  const [selectedLawyer, setSelectedLawyer] = useState(null);
  const [messages, setMessages] = useState({}); // Fixed: was 'message'
  const [newMessage, setNewMessage] = useState("");
  const [ws, setWs] = useState(null);
  const [inCall, setInCall] = useState(false);
  const [callStatus, setCallStatus] = useState("");
  const [incomingCall, setIncomingCall] = useState();

  const [loginForm, setLoginForm] = useState({
    username: "",
    password: "",
    role: "CLIENT",
  });

  const [isRegistering, setIsRegistering] = useState(false);

  const messagesEndRef = useRef(null); // Fixed: was 'messageEndRef'

  const remoteAudioRef = useRef(null);
  const pcRef = useRef(null);
  const offerRef = useRef(null); // to store incoming offer

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]); // Fixed: was 'message'

  const connectWebSocket = (token) => {
    const websocket = new WebSocket(`ws://localhost:3000/ws?token=${token}`);

    websocket.onopen = () => {
      console.log("Connected to WebSocket");
    };

    websocket.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      console.log("Received message:", data); // Debug log

      switch (data.type) {
        case "user_list":
          setLawyers(data.lawyers || []);
          break;
        case "message":
          setMessages((prev) => ({
            ...prev,
            [data.from]: [
              ...(prev[data.from] || []), // Fixed: was 'prev[data.form]' (typo)
              {
                id: Date.now(),
                text: data.message,
                from: data.from,
                timestamp: new Date().toLocaleTimeString(),
              },
            ],
          }));

          // Auto-select the user who sent the message if no one is selected
          if (!selectedLawyer) {
            // For lawyers, we need to create a client object to select
            if (user && user.role === "LAWYER") {
              setSelectedLawyer({
                username: data.from,
                status: "ONLINE", // Default status for clients
              });
            }
          }
          break;
        case "call_request":
          setCallStatus(`Incoming call from ${data.from}`);
          setIncomingCall(data.from);
          break;
        case "call_accepted":
          setInCall(true);
          setCallStatus("Call connected");
          break;
        case "call_ended":
          setInCall(false);
          setCallStatus("Call ended");
          setTimeout(() => setCallStatus(""), 3000);
          break;
        case "offer":
          offerRef.current = data.offer;
          setIncomingCall(data.from);
          setCallStatus(`Incoming call from ${data.from}`);
          break;

        case "answer":
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription(data.answer)
          );
          break;

        case "ice-candidate":
          if (data.candidate && pcRef.current) {
            try {
              await pcRef.current.addIceCandidate(
                new RTCIceCandidate(data.candidate)
              );
            } catch (err) {
              console.error("Error adding ice candidate", err);
            }
          }
          break;
      }
    };

    websocket.onclose = () => {
      console.log("WebSocket disconnected");
    };

    websocket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    setWs(websocket);
  };

  // handle login/register
  const handleAuth = async (e) => {
    e.preventDefault();

    try {
      const endpoint = isRegistering ? "/register" : "/login";
      const response = await fetch(`http://localhost:3000${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(loginForm),
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem("token", data.token);
        setUser(data.user);
        setIsLoggedIn(true);
        toast.success(
          `${isRegistering ? "Register succesful" : "Login succesful"}`
        );
        connectWebSocket(data.token);
      } else {
        toast.error(data.error || "Authentication failed");
        // alert(data.error || "Authentication failed");
      }
    } catch (err) {
      console.error("Auth error:", err);
      alert("Network error");
    }
  };

  // send message
  const sendMessage = () => {
    if (!newMessage.trim() || !selectedLawyer || !ws) return;

    console.log("Sending message:", newMessage, "to:", selectedLawyer.username); // Debug log

    ws.send(
      JSON.stringify({
        type: "message",
        to: selectedLawyer.username,
        message: newMessage,
      })
    );

    setMessages((prev) => ({
      ...prev,
      [selectedLawyer.username]: [
        ...(prev[selectedLawyer.username] || []),
        {
          id: Date.now(),
          text: newMessage,
          from: user.username,
          timestamp: new Date().toLocaleTimeString(),
          isSent: true,
        },
      ],
    }));

    setNewMessage("");
  };

  // start call
  // const startCall = () => {
  //   if (!selectedLawyer || !ws) return;

  //   ws.send(
  //     JSON.stringify({
  //       type: "call_request",
  //       to: selectedLawyer.username,
  //     })
  //   );

  //   setCallStatus("Calling..."); // Fixed: was 'calling'
  // };
  const startCall = async () => {
    if (!selectedLawyer || !ws) return;

    const pc = await createPeerConnection(selectedLawyer.username);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    ws.send(
      JSON.stringify({
        type: "offer",
        to: selectedLawyer.username,
        offer,
      })
    );

    setCallStatus("Calling...");
  };

  // end call
  const endCall = () => {
    if (!ws) return;

    ws.send(
      JSON.stringify({
        type: "call_end",
        to: selectedLawyer.username,
      })
    );

    setInCall(false);
    setCallStatus("");
  };

  // update lawyer status
  const updateStatus = async (status) => {
    try {
      const response = await fetch("http://localhost:3000/lawyers/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) alert("Failed to update status");
    } catch (err) {
      console.error("Status update error:", err);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      // Fixed: was '=='
      if (e.target.name === "message") {
        sendMessage();
      } else {
        handleAuth(e);
      }
    }
  };

  const createPeerConnection = async (targetUser) => {
    const pc = new RTCPeerConnection();

    // Add microphone audio
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    // Remote audio handler
    pc.ontrack = (event) => {
      remoteAudioRef.current.srcObject = event.streams[0];
    };

    // Send ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        ws.send(
          JSON.stringify({
            type: "ice-candidate",
            to: targetUser,
            candidate: event.candidate,
          })
        );
      }
    };

    pcRef.current = pc;
    return pc;
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-full mb-4">
              <Shield className="w-8 h-8 text-indigo-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              VakeelSaab
            </h1>
            <p className="text-gray-600">Legal consultation platform</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Role
              </label>
              <select
                value={loginForm.role}
                onChange={(e) =>
                  setLoginForm({ ...loginForm, role: e.target.value })
                }
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
              >
                <option value="CLIENT">Client</option>
                <option value="LAWYER">Lawyer</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <input
                type="text"
                value={loginForm.username}
                onChange={(e) =>
                  setLoginForm({ ...loginForm, username: e.target.value })
                }
                onKeyPress={handleKeyPress}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                placeholder="Enter your username"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) =>
                  setLoginForm({ ...loginForm, password: e.target.value })
                }
                onKeyPress={handleKeyPress}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                placeholder="Enter your password"
                required
              />
            </div>

            <button
              onClick={handleAuth}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-lg duration-200 shadow-lg hover:shadow-xl transition-colors"
            >
              {isRegistering ? "Register" : "Login"}
            </button>
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
            >
              {isRegistering
                ? "Already have an account? Login"
                : "Don't have an account? Register"}
            </button>
          </div>
        </div>
        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          pauseOnHover
          draggable
        />
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 flex">
      {/* sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        {/* header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center">
              <User className="w-6 h-6 text-white" />
            </div>

            <div>
              <h3 className="font-semibold text-gray-800">{user?.username}</h3>
              <p className="text-sm text-gray-600 capitalize">{user?.role}</p>
            </div>
          </div>

          {user?.role === "LAWYER" && (
            <div className="flex gap-2">
              <button
                onClick={() => updateStatus("ONLINE")}
                className="px-3 py-1 text-xs bg-green-100 text-green-800 rounded-full hover:bg-green-200 transition-colors"
              >
                Online
              </button>

              <button
                onClick={() => updateStatus("BUSY")}
                className="px-3 py-1 text-xs bg-red-100 text-red-800 rounded-full hover:bg-red-200 transition-colors"
              >
                Busy {/* Fixed: was missing text */}
              </button>
            </div>
          )}
        </div>

        {/* Users/Conversations List */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-gray-600" />
              <h4 className="font-medium text-gray-800">
                {user?.role === "CLIENT"
                  ? "Available Lawyers"
                  : "Conversations"}
              </h4>
            </div>

            {/* Show lawyers for clients, show conversations for lawyers */}
            {user?.role === "CLIENT" ? (
              lawyers.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No lawyers online
                </p>
              ) : (
                <div className="space-y-2">
                  {lawyers.map((lawyer) => (
                    <button
                      key={lawyer.username}
                      onClick={() => setSelectedLawyer(lawyer)}
                      className={`w-full p-3 rounded-lg text-left transition-colors ${
                        selectedLawyer?.username === lawyer.username
                          ? "bg-indigo-100 border-indigo-200"
                          : "bg-gray-50 hover:bg-gray-100"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-800">
                          {lawyer.username}
                        </span>
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${
                            lawyer.status === "ONLINE"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {lawyer.status}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )
            ) : // Show conversations for lawyers
            Object.keys(messages).length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No conversations yet
              </p>
            ) : (
              <div className="space-y-2">
                {Object.keys(messages).map((clientUsername) => {
                  const lastMessage =
                    messages[clientUsername][
                      messages[clientUsername].length - 1
                    ];
                  return (
                    <button
                      key={clientUsername}
                      onClick={() =>
                        setSelectedLawyer({
                          username: clientUsername,
                          status: "ONLINE",
                        })
                      }
                      className={`w-full p-3 rounded-lg text-left transition-colors ${
                        selectedLawyer?.username === clientUsername
                          ? "bg-indigo-100 border-indigo-200"
                          : "bg-gray-50 hover:bg-gray-100"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-800">
                          {clientUsername}
                        </span>
                        <span className="text-xs text-gray-500">
                          {lastMessage.timestamp}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 truncate">
                        {lastMessage.text}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* chat section */}
      <div className="flex-1 flex flex-col">
        {selectedLawyer ? (
          <>
            {/* header section */}
            <div className="p-6 bg-white border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">
                    {selectedLawyer.username}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {selectedLawyer.status}
                  </p>
                </div>
              </div>

              {user?.role === "CLIENT" && (
                <div className="flex items-center gap-2">
                  {callStatus && (
                    <span className="text-sm text-gray-600 mr-4">
                      {callStatus}
                    </span>
                  )}

                  {!inCall ? (
                    <button
                      onClick={startCall}
                      disabled={selectedLawyer.status !== "ONLINE"}
                      className="p-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-full transition-colors"
                    >
                      <Phone className="w-5 h-5" />
                    </button>
                  ) : (
                    <button
                      onClick={endCall}
                      className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors"
                    >
                      <PhoneOff className="w-5 h-5" />
                    </button>
                  )}
                </div>
              )}

              {user?.role === "LAWYER" &&
                callStatus.startsWith("Incoming call") && (
                  <div className="flex items-center gap-2">
                    <h3 className="text-md text-gray-600 font-light">
                      Incoming Call...
                    </h3>
                    <button
                      onClick={async () => {
                        const pc = await createPeerConnection(incomingCall);

                        await pc.setRemoteDescription(
                          new RTCSessionDescription(offerRef.current)
                        );

                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);

                        ws.send(
                          JSON.stringify({
                            type: "answer",
                            to: incomingCall,
                            answer,
                          })
                        );

                        setInCall(true);
                        setCallStatus("Call connected");
                      }}
                      className="px-2 py-2 bg-green-600 text-white rounded-4xl"
                    >
                      <Check className="w-5 h-5" />
                    </button>

                    <button
                      onClick={() => {
                        ws.send(
                          JSON.stringify({
                            type: "call_end",
                            to: incomingCall,
                          })
                        );
                        setCallStatus("");
                      }}
                      className="px-2 py-2 bg-red-600 text-white rounded-4xl"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                )}
            </div>

            {/* message section */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {(messages[selectedLawyer.username] || []).map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.isSent ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      message.isSent
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-200 text-gray-800"
                    }`}
                  >
                    <p>{message.text}</p>
                    <p
                      className={`text-xs mt-1 ${
                        message.isSent ? "text-indigo-200" : "text-gray-500"
                      }`}
                    >
                      {message.timestamp}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* message input */}
            <div className="p-6 bg-white border-t border-gray-200">
              <div className="flex gap-3">
                <input
                  type="text"
                  name="message"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your message..."
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />

                <button
                  onClick={sendMessage}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-600 mb-2">
                {user?.role === "CLIENT"
                  ? "Select a Lawyer"
                  : "Select a Conversation"}
              </h3>
              <p className="text-gray-500">
                {user?.role === "CLIENT"
                  ? "Choose a lawyer from the list to start chatting"
                  : "Select a client conversation to reply"}
              </p>
            </div>
          </div>
        )}
      </div>

      <audio ref={remoteAudioRef} autoPlay playsInline />
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnHover
        draggable
      />
    </div>
  );
};

export default App;
