const fileMessage = document.getElementById("fileMessage");
const fileInput = document.getElementById("fileInput");
const filePassword = document.getElementById("filePassword");
const dropZone = document.getElementById("dropZone");
const selectedFileName = document.getElementById("selectedFileName");
const passwordStrength = document.getElementById("passwordStrength");

function t(key, fallback) {
  return window.getTranslation ? window.getTranslation(key) : fallback;
}

function showFileMessage(text, type) {
  fileMessage.textContent = text;
  fileMessage.className = `message-box ${type}`;
}

function setWorkflowStep(activeStep) {
  const order = ["upload", "password", "encrypt", "download"];
  const activeIndex = order.indexOf(activeStep);

  document.querySelectorAll(".workflow-step").forEach((step) => {
    const stepIndex = order.indexOf(step.dataset.step);

    step.classList.toggle("done", stepIndex < activeIndex);
    step.classList.toggle("active", stepIndex === activeIndex);
  });
}

function updateSelectedFile(file) {
  if (!file) {
    selectedFileName.textContent = t("noFileSelected", "No file selected");
    setWorkflowStep("upload");
    return;
  }

  selectedFileName.textContent = `${t("selectedFile", "Selected file")}: ${file.name}`;
  setWorkflowStep("password");
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

function getPasswordStrength(password) {
  const rules = checkPasswordRules(password);
  const score = Object.values(rules).filter(Boolean).length;

  if (score >= 5) {
    return { level: "strong", label: t("passwordStrong", "Strong") };
  }

  if (score >= 3) {
    return { level: "medium", label: t("passwordMedium", "Medium") };
  }

  return { level: "weak", label: t("passwordWeak", "Weak") };
}

function isStrongPassword(password) {
  const r = checkPasswordRules(password);
  return r.length && r.upper && r.lower && r.number && r.symbol;
}

function updateFilePasswordRules() {
  const password = filePassword.value;
  const r = checkPasswordRules(password);
  const strength = getPasswordStrength(password);

  document.getElementById("fRuleLength").classList.toggle("valid", r.length);
  document.getElementById("fRuleUpper").classList.toggle("valid", r.upper);
  document.getElementById("fRuleLower").classList.toggle("valid", r.lower);
  document.getElementById("fRuleNumber").classList.toggle("valid", r.number);
  document.getElementById("fRuleSymbol").classList.toggle("valid", r.symbol);

  passwordStrength.className = `password-strength ${strength.level}`;
  passwordStrength.querySelector("strong").textContent = strength.label;

  if (fileInput.files[0] && password) {
    setWorkflowStep(isStrongPassword(password) ? "encrypt" : "password");
  }
}

filePassword.addEventListener("input", updateFilePasswordRules);

fileInput.addEventListener("change", () => {
  updateSelectedFile(fileInput.files[0]);
});

window.addEventListener("languageChanged", () => {
  updateSelectedFile(fileInput.files[0]);
  updateFilePasswordRules();
});

// Drag & drop ramane doar o metoda alternativa de selectare a fisierului.
dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("drag-over");

  const file = event.dataTransfer.files[0];

  if (!file) {
    return;
  }

  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  fileInput.files = dataTransfer.files;
  updateSelectedFile(file);
});

async function getKeyFromPassword(password, salt) {
  const encoder = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  // PBKDF2 transforma parola intr-o cheie AES-GCM de 256 biti.
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
  const file = fileInput.files[0];
  const password = filePassword.value;

  if (!file || !password) {
    showFileMessage(t("fileMissing", "Choose a file and enter the password."), "error");
    setWorkflowStep(!file ? "upload" : "password");
    return;
  }

  if (!isStrongPassword(password)) {
    showFileMessage(t("fileWeakPassword", "The password is not secure enough."), "error");
    setWorkflowStep("password");
    return;
  }

  showFileMessage(t("fileEncrypting", "Encrypting file..."), "info");
  setWorkflowStep("encrypt");

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
  setWorkflowStep("download");
  showFileMessage(t("fileEncrypted", "File encrypted successfully. Download started."), "success");
});

document.getElementById("decryptFileBtn").addEventListener("click", async () => {
  const file = fileInput.files[0];
  const password = filePassword.value;

  if (!file || !password) {
    showFileMessage(t("decryptMissing", "Choose the encrypted file and enter the password."), "error");
    return;
  }

  showFileMessage(t("fileDecrypting", "Decrypting file..."), "info");

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

    showFileMessage(t("fileDecrypted", "File decrypted successfully. Download started."), "success");

  } catch (error) {
    showFileMessage(t("fileDecryptError", "Wrong password or invalid file."), "error");
  }
});
