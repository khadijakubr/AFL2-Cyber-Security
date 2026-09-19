const io = require("socket.io-client");
const readline = require("readline");
const crypto = require("crypto");

const socket = io("http://localhost:3000");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

let username = "";

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

socket.on("connect", () => {
  console.log(`Connected to the server`);

  rl.question("Enter your username: ", (input) => {
    username = input;
    console.log(`Welcome, ${username} to the chat!`);
    rl.prompt();

    rl.on("line", (message) => {
        if (message.trim()) {
        const hash = sha256(message);
        socket.emit("message", { username, message, hash });
        }
        rl.prompt();
    });
  });
});

socket.on("message", (data) => {
    const { username: senderUsername, message: senderMessage, hash: senderHash } = data;
    if (senderUsername !== username) {
      const computedHash = sha256(senderMessage);
      if (computedHash !== senderHash) {
        console.log(`Warning: the message from ${senderUsername} may have been changed during transmission`);
        console.log(`${senderUsername}: ${senderMessage}`);
      } else {
        console.log(`${senderUsername}: ${senderMessage}`);
      }
    }
    rl.prompt();
});

socket.on("disconnect", () => {
  console.log(`Disconnected from the server`);
  rl.close();
  process.exit(0);
});

rl.on("SIGINT", () => {
  console.log("\nDisconnecting from the server...");
  socket.disconnect();
  rl.close();
  process.exit(0);
});