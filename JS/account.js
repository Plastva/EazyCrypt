import {
  deleteUser,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  auth,
  waitForAuth,
  getSavedAuthSession,
  getUserProfile,
  getMyActivityLogs,
  updateUserStatus,
  logActivity,
  formatLogDate
} from "./firebase-service.js";

const accountMessage = document.getElementById("accountMessage");
const accountRole = document.getElementById("accountRole");
const accountTotal = document.getElementById("accountTotal");
const accountFiles = document.getElementById("accountFiles");
const accountTexts = document.getElementById("accountTexts");
const accountEmail = document.getElementById("accountEmail");
const accountUid = document.getElementById("accountUid");
const accountStatus = document.getElementById("accountStatus");
const accountHistoryBody = document.getElementById("accountHistoryBody");
const deleteAccountBtn = document.getElementById("deleteAccountBtn");

let activeUser = null;
let authUser = null;

function t(key, fallback) {
  return window.getTranslation ? window.getTranslation(key) : fallback;
}

function setMessage(text, type = "info") {
  accountMessage.textContent = text;
  accountMessage.className = `admin-message ${type}`;
}

function clearLocalSession() {
  localStorage.removeItem("currentRole");
  localStorage.removeItem("eazycryptGuestMode");
  localStorage.removeItem("eazycryptAuthSession");
  sessionStorage.removeItem("eazycryptLoginRedirect");
}

function renderHistory(logs) {
  accountHistoryBody.innerHTML = "";
  accountTotal.textContent = logs.length;
  accountFiles.textContent = logs.filter((log) => log.targetType === "file").length;
  accountTexts.textContent = logs.filter((log) => log.targetType === "text").length;

  if (logs.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = t("noHistory", "Nu exista activitati salvate pentru acest cont.");
    row.appendChild(cell);
    accountHistoryBody.appendChild(row);
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
    accountHistoryBody.appendChild(row);
  });
}

async function loadAccount() {
  authUser = await waitForAuth();
  activeUser = authUser?.emailVerified ? authUser : getSavedAuthSession();

  if (!activeUser) {
    window.location.href = "login.html";
    return;
  }

  const profile = await getUserProfile(activeUser);
  const logs = await getMyActivityLogs(activeUser, 80);

  accountRole.textContent = profile.role || activeUser.role || "user";
  accountEmail.textContent = activeUser.email || "-";
  accountUid.textContent = activeUser.uid || "-";
  accountStatus.textContent = profile.status || "active";
  renderHistory(logs);
  setMessage(t("accountLoaded", "Datele contului au fost incarcate."), "success");
}

deleteAccountBtn.addEventListener("click", async () => {
  if (!activeUser) {
    return;
  }

  const confirmed = window.confirm(
    t("deleteAccountConfirm", "Sigur vrei sa stergi contul? Actiunea marcheaza contul ca sters si incearca eliminarea din Firebase Auth.")
  );

  if (!confirmed) {
    return;
  }

  deleteAccountBtn.disabled = true;
  setMessage(t("deletingAccount", "Se sterge contul..."), "info");

  try {
    await updateUserStatus(activeUser.uid, "deleted");
    await logActivity(activeUser, {
      actionType: "self_delete",
      targetType: "user",
      fileName: activeUser.email || activeUser.uid,
      status: "success"
    });

    if (authUser) {
      await deleteUser(authUser);
    } else {
      await signOut(auth).catch(() => {});
    }

    clearLocalSession();
    window.location.href = "login.html";
  } catch (error) {
    console.error(error);

    if (error.code === "auth/requires-recent-login") {
      setMessage(t("recentLoginRequired", "Firebase cere relogare recenta. Delogheaza-te, intra din nou si apasa iar Sterge contul."), "error");
    } else {
      setMessage(t("accountDeleteFailed", "Contul nu a putut fi sters complet. Verifica regulile Firestore sau autentificarea Firebase."), "error");
    }

    deleteAccountBtn.disabled = false;
  }
});

try {
  await loadAccount();
} catch (error) {
  console.error(error);
  setMessage(t("accountLoadFailed", "Pagina de cont nu poate incarca datele. Verifica autentificarea si Firestore."), "error");
}
