import {
  waitForAuth,
  getSavedAuthSession,
  getUserProfile,
  logActivity,
  logShare
} from "./firebase-service.js";

const fileMessage = document.getElementById("fileMessage");
const fileInput = document.getElementById("fileInput");
const filePassword = document.getElementById("filePassword");
const dropZone = document.getElementById("dropZone");
const selectedFileName = document.getElementById("selectedFileName");
const passwordStrength = document.getElementById("passwordStrength");
const fileSharePanel = document.getElementById("fileSharePanel");

let currentUser = null;
let currentProfile = { role: "guest" };
let lastEncryptedFileName = "";
let lastEncryptedBlob = null;
let lastEncryptedShareFile = null;
let lastEncryptedPayload = "";

function t(key, fallback) {
  return window.getTranslation ? window.getTranslation(key) : fallback;
}

function showFileMessage(text, type) {
  fileMessage.textContent = text;
  fileMessage.className = `message-box ${type}`;
}

function setSharePanelVisible(visible) {
  const canShare = currentUser && currentProfile.role !== "guest";
  fileSharePanel?.classList.toggle("hidden", !(visible && canShare));
}

async function safeLogActivity(metadata) {
  try {
    await logActivity(currentUser, metadata);
  } catch (error) {
    console.warn("Activity metadata could not be saved.", error);
  }
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
    setSharePanelVisible(false);
    return;
  }

  selectedFileName.textContent = `${t("selectedFile", "Selected file")}: ${file.name}`;
  lastEncryptedFileName = "";
  lastEncryptedBlob = null;
  lastEncryptedShareFile = null;
  lastEncryptedPayload = "";
  setSharePanelVisible(false);
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

  lastEncryptedPayload = JSON.stringify(encryptedPackage);

  const blob = new Blob(
    [lastEncryptedPayload],
    { type: "application/json" }
  );

  downloadFile(blob, file.name + ".eazycrypt");
  lastEncryptedFileName = file.name + ".eazycrypt";
  lastEncryptedBlob = blob;
  lastEncryptedShareFile = new File([blob], lastEncryptedFileName, { type: "application/json" });
  setWorkflowStep("download");
  setSharePanelVisible(true);
  showFileMessage(t("fileEncrypted", "File encrypted successfully. Download started."), "success");
  await safeLogActivity({
    actionType: "encrypt",
    targetType: "file",
    fileName: file.name,
    fileSize: file.size,
    status: "success"
  });
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
    await safeLogActivity({
      actionType: "decrypt",
      targetType: "file",
      fileName: encryptedPackage.fileName || file.name,
      fileSize: file.size,
      status: "success"
    });

  } catch (error) {
    showFileMessage(t("fileDecryptError", "Wrong password or invalid file."), "error");
    await safeLogActivity({
      actionType: "decrypt",
      targetType: "file",
      fileName: file.name,
      fileSize: file.size,
      status: "error"
    });
  }
});

document.getElementById("shareFileBtn")?.addEventListener("click", async () => {
  const encryptedName = lastEncryptedFileName || `${fileInput.files[0]?.name || "document"}.eazycrypt`;
  const shareText = `Fisier criptat EazyCrypt: ${encryptedName}. Parola NU este inclusa si trebuie transmisa separat.`;

  if (!lastEncryptedBlob || !lastEncryptedShareFile || !lastEncryptedPayload) {
    showFileMessage("Cripteaza mai intai fisierul pentru a pregati partajarea.", "error");
    return;
  }

  const canEmbedEncryptedPayload = lastEncryptedPayload.length <= 12000;
  const mailBody = canEmbedEncryptedPayload
    ? `${shareText}\n\nContinut criptat EazyCrypt:\n\n${lastEncryptedPayload}\n\nParola NU este inclusa. Trimite parola separat printr-un canal sigur.`
    : `${shareText}\n\nFisierul criptat este prea mare pentru a fi pus direct in email. Ataseaza fisierul .eazycrypt descarcat automat. Parola NU este inclusa si trebuie transmisa separat printr-un canal sigur.`;

  try {
    await navigator.clipboard.writeText(mailBody);
  } catch (error) {
    console.warn("Could not copy share message.", error);
  }

  if (navigator.canShare?.({ files: [lastEncryptedShareFile] })) {
    try {
      await navigator.share({
        title: "EazyCrypt - fisier criptat",
        text: shareText,
        files: [lastEncryptedShareFile]
      });

      showFileMessage("Fisierul criptat a fost pregatit pentru partajare.", "success");

      await logShare(currentUser, {
        targetType: "file",
        fileName: encryptedName,
        status: "shared",
        method: "web-share"
      });
      return;
    } catch (error) {
      if (error.name === "AbortError") {
        showFileMessage("Partajarea a fost anulata. Mesajul de partajare a fost copiat in clipboard.", "info");
        return;
      }

      console.warn("Web Share API failed, using mailto fallback.", error);
    }
  }

  const subject = encodeURIComponent("EazyCrypt - fisier criptat");
  const body = encodeURIComponent(mailBody);

  window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
  showFileMessage(
    canEmbedEncryptedPayload
      ? "Emailul a fost pregatit si mesajul a fost copiat in clipboard."
      : "Emailul a fost pregatit. Mesajul a fost copiat in clipboard; ataseaza fisierul .eazycrypt descarcat.",
    "info"
  );

  try {
    await logShare(currentUser, {
      targetType: "file",
      fileName: encryptedName,
      status: "prepared",
      method: "mailto"
    });
  } catch (error) {
    console.warn("Share metadata could not be saved.", error);
  }
});

const authUser = await waitForAuth();
currentUser = authUser?.emailVerified ? authUser : getSavedAuthSession();
currentProfile = currentUser ? await getUserProfile(currentUser) : { role: "guest" };
setSharePanelVisible(false);
