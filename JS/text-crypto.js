const textMessage = document.getElementById("textMessage");

function showTextMessage(text, type) {
  textMessage.textContent = text;
  textMessage.className = `message-box ${type}`;
}

/* PASSWORD RULES */

function checkPasswordRules(password) {
  return {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password)
  };
}

function isStrongPassword(password) {
  const r = checkPasswordRules(password);
  return r.length && r.upper && r.lower && r.number && r.symbol;
}

document.getElementById("textPassword").addEventListener("input", () => {
  const password = document.getElementById("textPassword").value;
  const r = checkPasswordRules(password);

  document.getElementById("tRuleLength").classList.toggle("valid", r.length);
  document.getElementById("tRuleUpper").classList.toggle("valid", r.upper);
  document.getElementById("tRuleLower").classList.toggle("valid", r.lower);
  document.getElementById("tRuleNumber").classList.toggle("valid", r.number);
  document.getElementById("tRuleSymbol").classList.toggle("valid", r.symbol);
});

/* CRYPTO */

async function getKeyFromPassword(password, salt) {
  const encoder = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
}

function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

/* ENCRYPT */

document.getElementById("encryptTextBtn").addEventListener("click", async () => {
  const text = document.getElementById("plainText").value;
  const password = document.getElementById("textPassword").value;

  if (!text || !password) {
    showTextMessage("Completează textul și parola.", "error");
    return;
  }

  if (!isStrongPassword(password)) {
    showTextMessage("Parola nu este suficient de sigură.", "error");
    return;
  }

  showTextMessage("Se criptează...", "info");

  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getKeyFromPassword(password, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    encoder.encode(text)
  );

  const result = {
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    data: bufferToBase64(encrypted)
  };

  document.getElementById("encryptedText").value = JSON.stringify(result);
  showTextMessage("Text criptat cu succes.", "success");
});

/* DECRYPT */

document.getElementById("decryptTextBtn").addEventListener("click", async () => {
  const encryptedText = document.getElementById("encryptedText").value;
  const password = document.getElementById("textPassword").value;

  if (!encryptedText || !password) {
    showTextMessage("Introdu textul criptat și parola.", "error");
    return;
  }

  showTextMessage("Se decriptează...", "info");

  try {
    const encryptedObject = JSON.parse(encryptedText);

    const salt = base64ToBuffer(encryptedObject.salt);
    const iv = base64ToBuffer(encryptedObject.iv);
    const data = base64ToBuffer(encryptedObject.data);

    const key = await getKeyFromPassword(password, salt);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      data
    );

    const decoder = new TextDecoder();
    document.getElementById("decryptedText").value = decoder.decode(decrypted);

    showTextMessage("Text decriptat cu succes.", "success");

  } catch {
    showTextMessage("Parolă greșită sau text invalid.", "error");
  }
});

/* COPY */

document.getElementById("copyTextBtn").addEventListener("click", async () => {
  const text = document.getElementById("encryptedText").value;

  if (!text) {
    showTextMessage("Nu există text de copiat.", "error");
    return;
  }

  await navigator.clipboard.writeText(text);

  const btn = document.getElementById("copyTextBtn");
  btn.textContent = "✔";

  setTimeout(() => {
    btn.textContent = "Copiază";
  }, 1000);

  showTextMessage("Text copiat.", "success");
});

/* CLEAR */

document.getElementById("clearTextBtn").addEventListener("click", () => {
  document.getElementById("plainText").value = "";
  document.getElementById("encryptedText").value = "";
  document.getElementById("decryptedText").value = "";

  showTextMessage("Câmpurile au fost curățate.", "info");
});