// models/message.js

const mongoose = require('mongoose');

// Define the schema for the message document
const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

// Create the Message model
const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
