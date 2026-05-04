const fileMessage = document.getElementById("fileMessage");

function showFileMessage(text, type) {
  fileMessage.textContent = text;
  fileMessage.className = `message-box ${type}`;
}

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

function updateFilePasswordRules() {
  const password = document.getElementById("filePassword").value;
  const r = checkPasswordRules(password);

  document.getElementById("fRuleLength").classList.toggle("valid", r.length);
  document.getElementById("fRuleUpper").classList.toggle("valid", r.upper);
  document.getElementById("fRuleLower").classList.toggle("valid", r.lower);
  document.getElementById("fRuleNumber").classList.toggle("valid", r.number);
  document.getElementById("fRuleSymbol").classList.toggle("valid", r.symbol);
}

document.getElementById("filePassword").addEventListener("input", updateFilePasswordRules);

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

function downloadFile(blob, fileName) {
  const link = document.createElement("a");

  link.href = URL.createObjectURL(blob);
  link.download = fileName;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

document.getElementById("encryptFileBtn").addEventListener("click", async () => {
  const file = document.getElementById("fileInput").files[0];
  const password = document.getElementById("filePassword").value;

  if (!file || !password) {
    showFileMessage("Alege fișierul și introdu parola.", "error");
    return;
  }

  if (!isStrongPassword(password)) {
    showFileMessage("Parola nu este suficient de sigură.", "error");
    return;
  }

  showFileMessage("Se criptează fișierul...", "info");

  const fileBuffer = await file.arrayBuffer();

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getKeyFromPassword(password, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    fileBuffer
  );

  const encryptedPackage = {
    fileName: file.name,
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    data: bufferToBase64(encrypted)
  };

  const blob = new Blob(
    [JSON.stringify(encryptedPackage)],
    { type: "application/json" }
  );

  downloadFile(blob, file.name + ".eazycrypt");
  showFileMessage("Fișier criptat cu succes. Descărcarea a început.", "success");
});

document.getElementById("decryptFileBtn").addEventListener("click", async () => {
  const file = document.getElementById("fileInput").files[0];
  const password = document.getElementById("filePassword").value;

  if (!file || !password) {
    showFileMessage("Alege fișierul criptat și introdu parola.", "error");
    return;
  }

  showFileMessage("Se decriptează fișierul...", "info");

  try {
    const text = await file.text();
    const encryptedPackage = JSON.parse(text);

    const salt = base64ToBuffer(encryptedPackage.salt);
    const iv = base64ToBuffer(encryptedPackage.iv);
    const data = base64ToBuffer(encryptedPackage.data);

    const key = await getKeyFromPassword(password, salt);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      data
    );

    const blob = new Blob([decrypted]);
    downloadFile(blob, encryptedPackage.fileName);

    showFileMessage("Fișier decriptat cu succes. Descărcarea a început.", "success");

  } catch (error) {
    showFileMessage("Parolă greșită sau fișier invalid.", "error");
  }
});