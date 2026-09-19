const io = require("socket.io-client");
const readline = require("readline");
const crypto = require("crypto");

const socket = io("http://localhost:3000");

const options = {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: "spki",
    format: "pem",
  },
  privateKeyEncoding: {
    type: "pkcs8",
    format: "pem",
  },
};

const { privateKey: senderPrivateKey, publicKey: senderPublicKey } = crypto.generateKeyPairSync("rsa", options);

function signMessage(message, privateKey) {
  const data = Buffer.from(message);
  const signature = crypto.sign("sha256", data, privateKey);
  return signature.toString("hex"); // kirim sebagai hex string
}

function verifyMessage(message, signatureHex, publicKey) {
  try {
    const data = Buffer.from(message);
    const signature = Buffer.from(signatureHex, "hex");
    return crypto.verify("sha256", data, publicKey, signature);
  } catch (err) {
    return false;
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

let registeredUsername = "";
let username = "";
const users = new Map();

socket.on("connect", () => {
  console.log(`Connected to the server`);

  rl.question("Enter your username: ", (input) => {
    registeredUsername = input;
    username = input;
    console.log(`Welcome, ${username} to the chat!`);

    socket.emit("registerPublicKey", { username, publicKey: senderPublicKey });
    rl.prompt();

    rl.on("line", (message) => {
        if (message.trim()) {
          if ((match = message.match(/^!impersonate (\w+)$/))) {
            username = match[1];
            console.log(`Now impersonating as ${username}`);
          } else if (message.match(/^!exit$/)) {
            username = registeredUsername;
            console.log(`Now you are ${username}`);
          } else {
            const signature = signMessage(message, senderPrivateKey);
            socket.emit("message", { username, message, signature });
          }
        }
        rl.prompt();
    });
  });
});

socket.on("init", (keys) => {
  keys.forEach(([username, publicKey]) => {
    users.set(username, publicKey);
  });
  console.log(`\nThere are currently ${users.size} users in the chat:`);
  rl.prompt();
});

socket.on("newUser", (data) => {
  const { username, publicKey } = data;
  users.set(username, publicKey);
  console.log(`${username} join the chat`);
  rl.prompt();
});

socket.on("message", (data) => {
    const { username: senderUsername, message: senderMessage, signature } = data;

    if (senderUsername === username) {
    rl.prompt();
    return;
    }

    const senderPublicKey = users.get(senderUsername);

    let isFake = false;

    if (!senderPublicKey || !signature) {
      isFake = true;
    } else {
      const valid = verifyMessage(senderMessage, signature, senderPublicKey);
      if (!valid) isFake = true;
    }

    if (isFake) {
      console.log(
        `[WARNING] ${senderUsername} (this user is fake): ${senderMessage}`
      );
    } else {
      console.log(`${senderUsername}: ${senderMessage}`);
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