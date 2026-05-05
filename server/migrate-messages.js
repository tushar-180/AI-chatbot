const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const messageSchema = new mongoose.Schema({
  chatId: { type: mongoose.Schema.Types.ObjectId, ref: "Chat" },
  userId: String,
});

const chatSchema = new mongoose.Schema({
  userId: String,
});

const Message = mongoose.model('Message', messageSchema);
const Chat = mongoose.model('Chat', chatSchema);

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const messages = await Message.find({ userId: { $exists: false } });
    console.log(`Found ${messages.length} messages to migrate`);

    for (const msg of messages) {
      const chat = await Chat.findById(msg.chatId);
      if (chat && chat.userId) {
        msg.userId = chat.userId;
        await msg.save();
      }
    }

    console.log("Migration completed");
  } catch (err) {
    console.error("Migration failed", err);
  } finally {
    await mongoose.disconnect();
  }
}

migrate();
