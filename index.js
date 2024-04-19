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
        text: `Please click the following link to verify your email : http://192.168.137.1:8000/verify/${verificationToken}`
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

    socket.on("disconnect", () => {
        console.log("Client disconnected");
    });

    // Join room
    socket.on('join-room', ({ roomName, user, userId, roomId }) => {
        socket.join(roomId);
        console.log(`${userId} joined room ${roomName}`);
        io.to(roomId).emit('user-joined', { user, userId });
    });
    socket.on('createRoom', async ({ name, creatorId, startTime, endTime }) => {
        try {
            // Check if creatorId corresponds to an existing user
            const existingUser = await User.findById(creatorId);
            if (!existingUser) {
                return socket.emit('creationError', { message: 'Creator not found' });
            }

            // Create a new room instance with start and end times
            const newRoom = new Room({
                name,
                creator: creatorId,
                participants: [creatorId],
                startTime,
                endTime
            });

            // Save the new room to the database
            const savedRoom = await newRoom.save();

            // Emit roomCreated event to all connected clients
            io.emit("roomCreated", savedRoom);

            // Emit success event to the creator
            socket.emit('roomCreationSuccess', { message: 'Room created successfully', room: savedRoom });
        } catch (error) {
            console.error("Error creating room:", error);
            // Emit error event to the creator
            socket.emit('creationError', { message: 'Failed to create room' });
        }
    });
    socket.on('message', (message) => {
        io.to(message.roomId).emit('message', message);
    });

    socket.on('leave-room', async ({ roomId, userId }) => {
        try {
            const room = await Room.findById(roomId);
            if (!room) {
                console.error('Room not found');
                return;
            }
            room.participants = room.participants.filter(participantId => participantId !== userId);
            await room.save();
            socket.leave(roomId);
            console.log(`User ${userId} left room ${roomId}`);

            // Emit an event to update room list for all clients
            io.emit('roomUpdated', await Room.find());

        } catch (error) {
            console.error('Error leaving room:', error);
        }
    });
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
const Room = require("./models/room");
app.post("/rooms/create", async (req, res) => {
    try {
        const { name, creatorId, startTime, endTime } = req.body;

        // Ensure that all required fields are provided
        if (!name || !creatorId || !startTime || !endTime) {
            return res.status(400).json({ message: "Name, creatorId, startTime, and endTime are required fields" });
        }

        // Check if the creatorId corresponds to an existing user
        const existingUser = await User.findById(creatorId);
        if (!existingUser) {
            return res.status(404).json({ message: "Creator not found" });
        }

        // Create a new room instance
        const newRoom = new Room({
            name,
            creator: creatorId,
            startTime,
            endTime,
            participants: [creatorId]
        });

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
app.delete('/rooms/:roomId', async (req, res) => {
    try {
        const roomId = req.params.roomId;

        // Find the room by ID and delete it from the database
        const deletedRoom = await Room.findByIdAndDelete(roomId);

        if (!deletedRoom) {
            // If the room with the provided ID doesn't exist
            return res.status(404).json({ message: 'Room not found.' });
        }

        // Respond with success message
        res.status(200).json({ message: 'Room deleted successfully.' });
    } catch (error) {
        // Handle errors
        console.error('Error deleting room:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});
app.delete('/rooms/:roomId/participants/:userId', async (req, res) => {
    try {
        const roomId = req.params.roomId;
        const userId = req.params.userId;

        // Find the room by ID and update it by removing the userId from the participants array
        const updatedRoom = await Room.findByIdAndUpdate(
            roomId,
            { $pull: { participants: userId } },
            { new: true }
        );

        if (!updatedRoom) {
            // If the room with the provided ID doesn't exist
            return res.status(404).json({ message: 'Room not found.' });
        }

        // Respond with success message
        res.status(200).json({ message: 'User removed from room successfully.' });
    } catch (error) {
        // Handle errors
        console.error('Error removing user from room:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});
app.get("/", (req, res) => {
    res.send("Hello World Proctors!")
})
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

