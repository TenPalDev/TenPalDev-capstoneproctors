// models/room.js

const mongoose = require('mongoose');

// Define the Room Schema
const roomSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    creator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }]
});

// Create the Room model
const Room = mongoose.model('Room', roomSchema);
module.exports = Room;
