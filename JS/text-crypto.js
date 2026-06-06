import {
  waitForAuth,
  getSavedAuthSession,
  getUserProfile,
  logActivity,
  logShare
} from "./firebase-service.js";

const textMessage = document.getElementById("textMessage");
const plainText = document.getElementById("plainText");
const textPassword = document.getElementById("textPassword");
const encryptedText = document.getElementById("encryptedText");
const decryptedText = document.getElementById("decryptedText");
const textPasswordStrength = document.getElementById("textPasswordStrength");
const textSharePanel = document.getElementById("textSharePanel");

let currentUser = null;
let currentProfile = { role: "guest" };

function t(key, fallback) {
  return window.getTranslation ? window.getTranslation(key) : fallback;
}

function showTextMessage(text, type) {
  textMessage.textContent = text;
  textMessage.className = `message-box ${type}`;
}

function setSharePanelVisible(visible) {
  const canShare = currentUser && currentProfile.role !== "guest";
  textSharePanel?.classList.toggle("hidden", !(visible && canShare));
}

async function safeLogActivity(metadata) {
  try {
    await logActivity(currentUser, metadata);
  } catch (error) {
    console.warn("Activity metadata could not be saved.", error);
  }
}

function setTextWorkflowStep(activeStep) {
  const order = ["text", "password", "encrypt", "result"];
  const activeIndex = order.indexOf(activeStep);

  document.querySelectorAll(".workflow-step").forEach((step) => {
    const stepIndex = order.indexOf(step.dataset.step);

    step.classList.toggle("done", stepIndex < activeIndex);
    step.classList.toggle("active", stepIndex === activeIndex);
  });
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

function updateTextPasswordRules() {
  const password = textPassword.value;
  const r = checkPasswordRules(password);
  const strength = getPasswordStrength(password);

  document.getElementById("tRuleLength").classList.toggle("valid", r.length);
  document.getElementById("tRuleUpper").classList.toggle("valid", r.upper);
  document.getElementById("tRuleLower").classList.toggle("valid", r.lower);
  document.getElementById("tRuleNumber").classList.toggle("valid", r.number);
  document.getElementById("tRuleSymbol").classList.toggle("valid", r.symbol);

  textPasswordStrength.className = `password-strength ${strength.level}`;
  textPasswordStrength.querySelector("strong").textContent = strength.label;

  if (!plainText.value.trim() && !encryptedText.value.trim()) {
    setTextWorkflowStep("text");
    return;
  }

  if (!password || !isStrongPassword(password)) {
    setTextWorkflowStep("password");
    return;
  }

  setTextWorkflowStep(encryptedText.value.trim() ? "result" : "encrypt");
}

plainText.addEventListener("input", () => {
  if (plainText.value.trim()) {
    setTextWorkflowStep(textPassword.value ? "password" : "text");
  } else {
    setTextWorkflowStep("text");
  }
});

textPassword.addEventListener("input", updateTextPasswordRules);

encryptedText.addEventListener("input", () => {
  if (encryptedText.value.trim()) {
    setTextWorkflowStep("result");
    setSharePanelVisible(true);
  } else {
    setSharePanelVisible(false);
  }
});

window.addEventListener("languageChanged", updateTextPasswordRules);

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

document.getElementById("encryptTextBtn").addEventListener("click", async () => {
  const text = plainText.value;
  const password = textPassword.value;

  if (!text || !password) {
    showTextMessage(t("textMissing", "Complete the text and password."), "error");
    setTextWorkflowStep(!text ? "text" : "password");
    return;
  }

  if (!isStrongPassword(password)) {
    showTextMessage(t("textWeakPassword", "The password is not secure enough."), "error");
    setTextWorkflowStep("password");
    return;
  }

  showTextMessage(t("textEncrypting", "Encrypting text..."), "info");
  setTextWorkflowStep("encrypt");

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

  encryptedText.value = JSON.stringify(result);
  setTextWorkflowStep("result");
  setSharePanelVisible(true);
  showTextMessage(t("textEncrypted", "Text encrypted successfully."), "success");
  await safeLogActivity({
    actionType: "encrypt",
    targetType: "text",
    status: "success"
  });
});

document.getElementById("decryptTextBtn").addEventListener("click", async () => {
  const text = encryptedText.value;
  const password = textPassword.value;

  if (!text || !password) {
    showTextMessage(t("textDecryptMissing", "Enter encrypted text and password."), "error");
    return;
  }

  showTextMessage(t("textDecrypting", "Decrypting text..."), "info");

  try {
    const encryptedObject = JSON.parse(text);

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
    decryptedText.value = decoder.decode(decrypted);

    setTextWorkflowStep("result");
    showTextMessage(t("textDecrypted", "Text decrypted successfully."), "success");
    await safeLogActivity({
      actionType: "decrypt",
      targetType: "text",
      status: "success"
    });

  } catch {
    showTextMessage(t("textDecryptError", "Wrong password or invalid text."), "error");
    await safeLogActivity({
      actionType: "decrypt",
      targetType: "text",
      status: "error"
    });
  }
});

document.getElementById("copyTextBtn").addEventListener("click", async () => {
  const text = encryptedText.value;

  if (!text) {
    showTextMessage(t("copyMissing", "There is no text to copy."), "error");
    return;
  }

  await navigator.clipboard.writeText(text);

  const btn = document.getElementById("copyTextBtn");
  btn.textContent = t("copied", "Copied");

  setTimeout(() => {
    btn.textContent = t("copyText", "Copy");
  }, 1000);

  showTextMessage(t("textCopied", "Text copied."), "success");
});

document.getElementById("downloadTextBtn")?.addEventListener("click", () => {
  const text = encryptedText.value;

  if (!text) {
    showTextMessage("Nu exista text criptat de descarcat.", "error");
    return;
  }

  const blob = new Blob([text], { type: "application/json" });
  const link = document.createElement("a");

  link.href = URL.createObjectURL(blob);
  link.download = "text.eazycrypt";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);

  showTextMessage("Textul criptat a fost descarcat.", "success");
});

document.getElementById("clearTextBtn").addEventListener("click", () => {
  plainText.value = "";
  encryptedText.value = "";
  decryptedText.value = "";
  setSharePanelVisible(false);

  setTextWorkflowStep("text");
  updateTextPasswordRules();
  showTextMessage(t("fieldsCleared", "Fields were cleared."), "info");
});

document.getElementById("shareTextBtn")?.addEventListener("click", async () => {
  const result = encryptedText.value.trim();

  if (!result) {
    showTextMessage("Nu exista rezultat criptat de partajat.", "error");
    return;
  }

  const subject = encodeURIComponent("EazyCrypt - text criptat");
  const body = encodeURIComponent(
    `Rezultat criptat EazyCrypt:\n\n${result}\n\nParola NU este inclusa. Trimite parola separat printr-un canal sigur.`
  );

  window.location.href = `mailto:?subject=${subject}&body=${body}`;

  try {
    await logShare(currentUser, {
      targetType: "text",
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
setSharePanelVisible(Boolean(encryptedText.value.trim()));
