import {
  waitForAuth,
  getSavedAuthSession,
  getUserProfile,
  getMyActivityLogs,
  formatLogDate
} from "./firebase-service.js";

const historyMessage = document.getElementById("historyMessage");
const historyTableBody = document.getElementById("historyTableBody");
const historyTotal = document.getElementById("historyTotal");
const historyFiles = document.getElementById("historyFiles");
const historyTexts = document.getElementById("historyTexts");

function t(key, fallback) {
  return window.getTranslation ? window.getTranslation(key) : fallback;
}

function setMessage(text, type = "info") {
  historyMessage.textContent = text;
  historyMessage.className = `admin-message ${type}`;
}

function renderLogs(logs) {
  historyTableBody.innerHTML = "";

  historyTotal.textContent = logs.length;
  historyFiles.textContent = logs.filter((log) => log.targetType === "file").length;
  historyTexts.textContent = logs.filter((log) => log.targetType === "text").length;

  if (logs.length === 0) {
    setMessage(t("noHistory", "Nu exista activitati salvate pentru acest cont."), "info");
    return;
  }

  logs.forEach((log) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${formatLogDate(log)}</td>
      <td>${log.actionType || "-"}</td>
      <td>${log.targetType || "-"}</td>
      <td>${log.fileName || t("secureText", "Text securizat")}</td>
      <td>${log.status || "-"}</td>
    `;
    historyTableBody.appendChild(row);
  });

  setMessage(t("historyLoaded", "Istoricul a fost incarcat."), "success");
}

try {
  const user = await waitForAuth();
  const activeUser = user?.emailVerified ? user : getSavedAuthSession();

  if (!activeUser) {
    window.location.href = "login.html";
  } else {
    const profile = await getUserProfile(activeUser);

    if (profile.role === "guest") {
      window.location.href = "dashboard.html";
    }

    const logs = await getMyActivityLogs(activeUser, 80);
    renderLogs(logs);
  }
} catch (error) {
  console.error(error);
  setMessage("Istoricul nu poate fi incarcat. Verifica regulile Firestore si indexurile cerute.", "error");
}
