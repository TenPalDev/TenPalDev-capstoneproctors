const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
const port = 8000;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const server = http.createServer(app);
const io = socketIo(server);
// MongoDB connection
mongoose.connect("mongodb+srv://data:data@cluster0.sekzc9f.mongodb.net/")
    .then(() => {
        console.log("Connected to MongoDB");
    })
    .catch((err) => {
        console.log("Error connecting to MongoDB", err);
    });
// User model
const User = require("./models/user");
const Room = require("./models/room");
const Message = require("./models/message");

// Function to send verification email
const sendVerificationEmail = async (email, verificationToken) => {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: "joshuaaleria.me@gmail.com",
            pass: "rilvllbajlyupsyd",
        },
    });
    const mailOptions = {
        from: "proctor +",
        to: email,
        subject: "Email Verification",
        text: `Please click the following link to verify your email : https://tenpaldev-capstoneproctors.onrender.com/verify/${verificationToken}`
    };
    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.log("Error sending verification email", error);
    }
};

// Socket.IO connection
io.on("connection", (socket) => {
    console.log("New client connected");

    // Join room
    const rooms = {}; // Room name -> list of participants

    // Join room
    socket.on("joinRoom", (roomName) => {
        console.log("User joined room:", roomName);
        socket.join(roomName);
        // Initialize participants list for the room if not already exists
        if (!rooms[roomName]) {
            rooms[roomName] = [];
        }
        // Add user to the participants list for the room
        rooms[roomName].push(socket.id);
        // Emit updated participants list to all clients in the room
        io.to(roomName).emit('participants', rooms[roomName]);

        // Add listeningResponse event handler
        socket.on('askListening', ({ participantId }) => {
            // Assuming you have some logic to determine if the participant is listening
            const isListening = false; // Replace this with your logic

            // Emit a message back to the initiator (client) indicating the participant's response
            io.emit('showAlert', { participantId });

            // Store the participant's response temporarily
            let participantResponse = '';

            socket.on('listeningResponse', ({ participantId, response }) => {
                // Check if the response is from the correct participant
                if (participantId === participantId) {
                    participantResponse = response;

                    // You can optionally emit this response to the initiator (client) or handle it as needed
                    console.log(`Participant ${participantId} responded with '${participantResponse}'`);
                }
            });

            // After a certain timeout, check if the participant has responded
            const responseTimeout = 30000; // 30 seconds timeout (adjust as needed)
            setTimeout(() => {
                if (participantResponse === '') {
                    // If the participant hasn't responded, assume they are not listening
                    io.emit('listeningResponse', { participantId, response: 'no' });
                    console.log(`Timeout reached for participant ${participantId}, assuming 'no'`);
                }
            }, responseTimeout);
        });
        socket.on('requestOpenCamera', ({ participantId }) => {
            // Emit event to the participant's socket asking to open camera
            io.to(participantId).emit('openCameraRequest');
        
            // Set timeout for participant response
            const responseTimeout = 30000; // 30 seconds timeout
            setTimeout(() => {
                // If the participant hasn't responded, assume they are not opening the camera
                io.emit('openCameraResponse', { participantId, response: 'no' });
            }, responseTimeout);
        });

        // Add event handler for receiving participant's response
        socket.on('openCameraResponse', ({ participantId, response }) => {
            // Handle participant's response here
            console.log(`Participant ${participantId} responded with '${response}'`);
            // Emit event to the initiator to show alert based on participant's response
            io.emit('showAlert', { participantId, response });
        });
        socket.on('toggleCamera', (roomName) => {
            console.log(`Camera toggle requested for room: ${roomName}`);
            // Implement logic to activate the participant's camera here
            // For example, you might emit an event to the client to start the camera
            io.to(roomName).emit('startCamera'); // This will emit an event to all clients in the specified room to start their cameras
        });
    });
    socket.on("disconnect", () => {
        console.log("Client disconnected");

        // Remove user from the participants list for all rooms
        for (const roomName in rooms) {
            if (rooms.hasOwnProperty(roomName)) {
                const index = rooms[roomName].indexOf(socket.id);
                if (index !== -1) {
                    rooms[roomName].splice(index, 1);

                    // Emit updated participants list to all clients in the room
                    io.to(roomName).emit('participants', rooms[roomName]);
                }
            }
        }
    });

    // Handle adding user to room participants
    socket.on('addUserToRoom', async ({ userId, roomName }) => {
        console.log(`Adding user ${userId} to room ${roomName}`);
        try {
            // Find the room by name
            const room = await Room.findOne({ name: roomName });
            if (!room) {
                console.error('Room not found');
                return;
            }
            // Add the user to the participants array
            room.participants.push(userId);
            await room.save();
            // Join the room
            socket.join(roomName);
        } catch (error) {
            console.error('Error adding user to room:', error);
        }
    });
    // Handle client disconnection
    socket.on("disconnect", () => {
        console.log("Client disconnected");
    });
    // WebRTC signaling events

    // Receive and broadcast offer
    socket.on('offer', ({ userId, offer, roomName }) => {
        console.log(`Received offer from ${userId} in room ${roomName}`);
        // Broadcast the offer to all clients in the room except the sender
        socket.to(roomName).emit('offer', { userId, offer });
    });
    // Receive and broadcast answer
    socket.on('answer', ({ userId, answer, roomName }) => {
        console.log(`Received answer from ${userId} in room ${roomName}`);
        // Broadcast the answer to all clients in the room except the sender
        socket.to(roomName).emit('answer', { userId, answer });
    });

    // Receive and broadcast ICE candidate
    socket.on('iceCandidate', ({ userId, candidate, roomName }) => {
        console.log(`Received ICE candidate from ${userId} in room ${roomName}`);
        // Broadcast the ICE candidate to all clients in the room except the sender
        socket.to(roomName).emit('iceCandidate', { userId, candidate });
    });
    socket.on("message", async (message) => {
        console.log("Received message:", message);

        try {
            // Save the message to the database
            const newMessage = new Message({
                sender: message.sender,
                receiver: message.receiver,
                text: message.text,
                timestamp: new Date(),
            });
            await newMessage.save();
            // Broadcast the received message to all connected clients
            io.emit("message", message);
        } catch (error) {
            console.error("Error saving message:", error);
        }
    });
    // Handle client disconnection
    socket.on("disconnect", () => {
        console.log("Client disconnected");
    });



});
// Register endpoint
app.post("/register", async (req, res) => {
    try {
        const { firstname, lastname, email, age, phone, schoolname, password } = req.body;

        // Check if the email is already registered
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            console.log("Email already registered:", email);
            return res.status(400).json({ message: "Email already registered" });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create a new user with hashed password
        const newUser = new User({ firstname, lastname, email, age, phone, schoolname, password: hashedPassword });

        // Generate and store the verification token
        newUser.verificationToken = crypto.randomBytes(20).toString("hex");

        // Save the user to the database
        await newUser.save();

        console.log("New User Registered:", newUser);

        // Send verification email to the user
        sendVerificationEmail(newUser.email, newUser.verificationToken);

        res.status(201).json({
            message: "Registration successful. Please check your email for verification.",
        });
    } catch (error) {
        console.log("Error during registration:", error);
        res.status(500).json({ message: "Registration failed" });
    }
});

// Email verification endpoint
app.get("/verify/:token", async (req, res) => {
    try {
        const token = req.params.token;

        // Find the user with the given verification token
        const user = await User.findOne({ verificationToken: token });
        if (!user) {
            return res.status(404).json({ message: "Invalid verification token" });
        }

        // Mark the user as verified and remove the verification token
        user.verified = true;
        user.verificationToken = undefined;

        await user.save();

        res.status(200).json({ message: "Email verified successfully" });
    } catch (error) {
        console.error("Error during email verification:", error);
        res.status(500).json({ message: "Email Verification Failed" });
    }
});
const generateSecretKey = () => {
    const secretKey = crypto.randomBytes(32).toString("hex");
    return secretKey;
}
const secretKey = generateSecretKey()
//login endpoint
// Login endpoint
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        // Compare hashed password with plain-text password
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        // Generate token
        const token = jwt.sign({ userId: user._id }, secretKey);
        res.status(200).json({ token });
    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).json({ message: "Login failed" });
    }
});

// Get user profile endpoint
app.get("/profile/:userId", async (req, res) => {
    try {
        const userId = req.params.userId;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        res.status(200).json({ user });
    } catch (error) {
        res.status(500).json({ message: "Error retrieving the user profile" });
    }
});

// Update user role endpoint
app.put("/updateUserRole/:userId", async (req, res) => {
    try {
        const userId = req.params.userId;
        const { newRole, schoolName } = req.body;

        // Find the user by userId
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Update the user's role and school name
        user.role = newRole;
        user.schoolname = schoolName;

        // Save the updated user to the database
        await user.save();

        res.status(200).json({ message: "User role and school name updated successfully" });
    } catch (error) {
        console.error("Error updating user role and school name:", error);
        res.status(500).json({ message: "Failed to update user role and school name" });
    }
});
// Create room endpoint
app.post("/rooms/create", async (req, res) => {
    try {
        const { name, creatorId } = req.body;

        // Ensure that both name and creatorId are provided
        if (!name || !creatorId) {
            return res.status(400).json({ message: "Name and creatorId are required fields" });
        }

        // Check if the creatorId corresponds to an existing user
        const existingUser = await User.findById(creatorId);
        if (!existingUser) {
            return res.status(404).json({ message: "Creator not found" });
        }

        // Create a new room instance
        const newRoom = new Room({ name, creator: creatorId, participants: [creatorId] });
        // Save the new room to the database
        await newRoom.save();

        // Emit roomCreated event to all connected clients
        io.emit("roomCreated", newRoom);

        // Return success response
        res.status(201).json({ message: "Room created successfully", room: newRoom });
    } catch (error) {
        console.error("Error creating room:", error);
        res.status(500).json({ message: "Failed to create room" });
    }
});
// Invite to room endpoint
app.post("/:roomId/invite", async (req, res) => {
    try {
        const { userId } = req.body;
        const roomId = req.params.roomId;
        const room = await Room.findById(roomId);
        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }
        room.participants.push(userId);
        await room.save();
        res.status(200).json({ message: "User invited to the room" });
    } catch (error) {
        console.error("Error inviting user to room:", error);
        res.status(500).json({ message: "Failed to invite user to room" });
    }
});
app.get("/rooms", async (req, res) => {
    try {
        const rooms = await Room.find();
        res.status(200).json({ rooms });
    } catch (error) {
        console.error("Error fetching rooms:", error);
        res.status(500).json({ message: "Failed to fetch rooms" });
    }
});
app.get('/search-users', async (req, res) => {
    const { searchTerm } = req.query;
    try {
        const users = await User.find(
            { $or: [{ firstname: searchTerm }, { lastname: searchTerm }, { email: searchTerm }] },
            { firstname: 1, lastname: 1, email: 1, _id: 1 });
        res.json(users);
        console.log(users);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get("/messages", async (req, res) => {
    try {
        // Find all messages and populate sender and receiver fields
        const messages = await Message.find().populate('sender receiver');
        res.json(messages);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});
app.get('/getParticipants', async (req, res) => {
    const { roomName } = req.query;
    try {
        // Find the room by name
        const room = await Room.findOne({ name: roomName });
        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }

        // Fetch the participants for the room
        const participants = await User.find({ _id: { $in: room.participants } });
        res.json(participants);
    } catch (error) {
        console.error("Error fetching participants:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get("/", (req, res) => {
    res.send("Hello Proctor!")
})
//PORT
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
