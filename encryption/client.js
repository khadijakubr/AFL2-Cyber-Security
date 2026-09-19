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

function encryptForRecipient(message, recipientPublicKey) {
  const data = Buffer.from(message);
  const ciphertext = crypto.publicEncrypt(recipientPublicKey, data);
  return ciphertext.toString("hex");
}

function decryptFromSender(ciphertextHex, recipientPrivateKey) {
  try {
    const ciphertext = Buffer.from(ciphertextHex, "hex");
    const plaintext = crypto.privateDecrypt(recipientPrivateKey, ciphertext);
    return plaintext.toString("utf8");
  } catch (err) {
    return null;
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

let targetUsername = "";
let username = "";
const users = new Map();

socket.on("connect", () => {
  console.log(`Connected to the server`);

  rl.question("Enter your username: ", (input) => {
    username = input;
    console.log(`Welcome, ${username} to the chat!`);

    socket.emit("registerPublicKey", { username, publicKey: senderPublicKey });
    rl.prompt();

    rl.on("line", (message) => {
      if (message.trim()) {
        const match = message.match(/^!secret (\w+)$/);

        if (match) {
          targetUsername = match[1];
          console.log(`Now you are secretly chatting with ${targetUsername}`);
        } else if (message.match(/^!exit$/)) {
          targetUsername = "";
          console.log(`No more secretly chatting with ${username}`);
        } else {
          const signature = signMessage(message, senderPrivateKey);

          if (targetUsername) {
            const recipientPublicKey = users.get(targetUsername);
            if (!recipientPublicKey) {
              console.log(`No public key available for ${targetUsername}`);
            } else {
              const ciphertext = encryptForRecipient(message, recipientPublicKey);
              socket.emit("message", { username, message: null, ciphertext, targetUsername, signature });
            }
          } else {
            socket.emit("message", { username, message, signature });
          }
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
  const { username: senderUsername, message: senderMessage, ciphertext, targetUsername: msgTarget, signature } = data;

  if (senderUsername === username) {
    rl.prompt();
    return;
  }

  const senderPublicKey = users.get(senderUsername);

  if (ciphertext) {
    let plaintext = null;

    if (msgTarget === username) {
      plaintext = decryptFromSender(ciphertext, senderPrivateKey);
    }

    if (plaintext === null) {
      console.log(`[WARNING] ${senderUsername} sent an unreadable encrypted message`);
    } else {
      const isFake = !senderPublicKey || !signature || !verifyMessage(plaintext, signature, senderPublicKey);

      if (isFake) {
        console.log(`[WARNING] ${senderUsername} (this user is fake): ${plaintext}`);
      } else {
        console.log(`${senderUsername}: ${plaintext}`);
      }
    }
  } else {
    const isFake = !senderPublicKey || !signature || !verifyMessage(senderMessage, signature, senderPublicKey);

    if (isFake) {
      console.log(`[WARNING] ${senderUsername} (this user is fake): ${senderMessage}`);
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