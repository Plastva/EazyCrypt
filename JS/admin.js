import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  auth,
  waitForAuth,
  getSavedAuthSession,
  getUserProfile,
  getAdminData,
  getLocalActivityLogs,
  setLocalRoleOverride,
  updateUserRole,
  updateUserStatus,
  logActivity,
  formatLogDate,
  defaultAdminEmails,
  normalizeEmail
} from "./firebase-service.js";

const adminTableBody = document.getElementById("adminTableBody");
const adminMessage = document.getElementById("adminMessage");
const activityLog = document.getElementById("activityLog");
const adminCount = document.getElementById("adminCount");
const normalUserCount = document.getElementById("normalUserCount");
const activityCount = document.getElementById("activityCount");
const shareCount = document.getElementById("shareCount");

let currentUser = null;

function getCurrentUserRow() {
  if (!currentUser) {
    return null;
  }

  return {
    id: currentUser.uid,
    uid: currentUser.uid,
    email: currentUser.email || "",
    role: defaultAdminEmails.includes(normalizeEmail(currentUser.email)) ? "admin" : (currentUser.role || "user"),
    localOnly: true
  };
}

function ensureCurrentUserVisible(users) {
  const currentRow = getCurrentUserRow();

  if (!currentRow) {
    return users;
  }

  const exists = users.some((user) => (user.uid || user.id) === currentRow.uid);
  return exists ? users : [currentRow, ...users];
}

function showAdminMessage(text, type) {
  adminMessage.textContent = text;
  adminMessage.className = `admin-message ${type}`;
}

function formatDate(value) {
  if (value?.toDate) {
    return value.toDate().toLocaleString();
  }

  return "-";
}

function renderStats(data) {
  const encryptCount = data.activityLogs.filter((log) => log.actionType === "encrypt").length;
  const decryptCount = data.activityLogs.filter((log) => log.actionType === "decrypt").length;

  adminCount.textContent = data.users.length;
  normalUserCount.textContent = data.users.filter((user) => user.role !== "admin").length;
  activityCount.textContent = `${encryptCount} / ${decryptCount}`;
  shareCount.textContent = data.shareLogs.length;
}

function renderUsers(users) {
  adminTableBody.innerHTML = "";

  if (users.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "Nu exista utilizatori in colectia users.";
    row.appendChild(cell);
    adminTableBody.appendChild(row);
    return;
  }

  users.forEach((user) => {
    const row = document.createElement("tr");
    const emailCell = document.createElement("td");
    const roleCell = document.createElement("td");
    const createdCell = document.createElement("td");
    const actionCell = document.createElement("td");
    const roleSelect = document.createElement("select");
    const saveButton = document.createElement("button");
    const resetButton = document.createElement("button");
    const deleteButton = document.createElement("button");
    const isProtectedAdmin = defaultAdminEmails.includes(normalizeEmail(user.email));
    const isDeleted = user.status === "deleted";

    emailCell.textContent = user.email || "-";
    if (isDeleted) {
      const statusBadge = document.createElement("span");
      statusBadge.className = "status-badge deleted";
      statusBadge.textContent = "sters";
      emailCell.appendChild(statusBadge);
    }
    createdCell.textContent = formatDate(user.createdAt);

    ["user", "admin"].forEach((role) => {
      const option = document.createElement("option");
      option.value = role;
      option.textContent = role;
      roleSelect.appendChild(option);
    });

    roleSelect.value = user.role || "user";
    roleSelect.className = "role-select";
    roleSelect.disabled = isProtectedAdmin;

    saveButton.className = "table-action-btn primary-action";
    saveButton.textContent = isProtectedAdmin ? "Protejat" : "Salveaza";
    saveButton.disabled = isProtectedAdmin || isDeleted;

    saveButton.addEventListener("click", async () => {
      try {
        await updateUserRole(user.uid || user.id, roleSelect.value);
        setLocalRoleOverride(user.email || "", roleSelect.value);

        if (currentUser?.email && normalizeEmail(currentUser.email) === normalizeEmail(user.email)) {
          currentUser.role = roleSelect.value;
          const session = JSON.parse(localStorage.getItem("eazycryptAuthSession") || "null");

          if (session) {
            session.role = roleSelect.value;
            localStorage.setItem("eazycryptAuthSession", JSON.stringify(session));
          }
        }

        await logActivity(currentUser, {
          actionType: "role_update",
          targetType: "user",
          fileName: user.email || user.id,
          status: "success"
        });
        showAdminMessage(`Rol actualizat pentru ${user.email}.`, "success");
        await renderAdminDashboard();
      } catch (error) {
        console.error(error);
        setLocalRoleOverride(user.email || "", roleSelect.value);
        showAdminMessage("Firestore a refuzat actualizarea, dar rolul a fost salvat local pentru acest browser. Verifica regulile Firestore pentru persistenta globala.", "info");
        await renderAdminDashboard();
      }
    });

    resetButton.className = "table-action-btn secondary-action";
    resetButton.textContent = "Reset parola";
    resetButton.disabled = !user.email || isDeleted;
    resetButton.addEventListener("click", async () => {
      try {
        await sendPasswordResetEmail(auth, user.email);
        await logActivity(currentUser, {
          actionType: "password_reset_email",
          targetType: "user",
          fileName: user.email,
          status: "success"
        });
        showAdminMessage(`Email de resetare trimis catre ${user.email}.`, "success");
      } catch (error) {
        console.error(error);
        showAdminMessage("Emailul de resetare nu a putut fi trimis. Verifica Firebase Auth.", "error");
      }
    });

    deleteButton.className = "table-action-btn danger-action";
    deleteButton.textContent = isDeleted ? "Sters" : "Sterge";
    deleteButton.disabled = isProtectedAdmin || isDeleted;
    deleteButton.addEventListener("click", async () => {
      const confirmed = window.confirm(
        `Marchezi contul ${user.email || user.id} ca sters in Firestore? Contul din Firebase Auth necesita Cloud Function pentru stergere reala.`
      );

      if (!confirmed) {
        return;
      }

      try {
        await updateUserStatus(user.uid || user.id, "deleted");
        await logActivity(currentUser, {
          actionType: "user_soft_delete",
          targetType: "user",
          fileName: user.email || user.id,
          status: "success"
        });
        showAdminMessage(`Cont marcat ca sters: ${user.email}.`, "success");
        await renderAdminDashboard();
      } catch (error) {
        console.error(error);
        showAdminMessage("Contul nu a putut fi marcat ca sters. Verifica regulile Firestore.", "error");
      }
    });

    roleCell.appendChild(roleSelect);
    const actionGroup = document.createElement("div");
    actionGroup.className = "table-action-group";
    actionGroup.appendChild(saveButton);
    actionGroup.appendChild(resetButton);
    actionGroup.appendChild(deleteButton);
    actionCell.appendChild(actionGroup);

    row.appendChild(emailCell);
    row.appendChild(roleCell);
    row.appendChild(createdCell);
    row.appendChild(actionCell);
    adminTableBody.appendChild(row);
  });
}

function renderActivityLog(logs) {
  activityLog.innerHTML = "";

  if (logs.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.textContent = "Nu exista actiuni inca.";
    activityLog.appendChild(emptyItem);
    return;
  }

  logs.slice(0, 30).forEach((item) => {
    const li = document.createElement("li");
    const filePart = item.fileName ? ` | fisier: ${item.fileName}` : "";
    li.textContent = `${formatLogDate(item)} | ${item.email || "-"} | ${item.role || "-"} | ${item.actionType || "-"} ${item.targetType || "-"} | ${item.status || "-"}${filePart}`;
    activityLog.appendChild(li);
  });
}

async function renderAdminDashboard() {
  showAdminMessage("Se incarca datele din Firestore...", "info");

  try {
    const data = await getAdminData(120);
    const users = ensureCurrentUserVisible(data.users);

    renderStats({ ...data, users });
    renderUsers(users);
    renderActivityLog(data.activityLogs);
    showAdminMessage("Admin panel incarcat.", "success");
  } catch (error) {
    console.error(error);

    const localLogs = getLocalActivityLogs(currentUser, 120);
    const users = ensureCurrentUserVisible([]);
    const shareLogs = localLogs.filter((log) => log.actionType === "share");

    renderStats({
      users,
      activityLogs: localLogs,
      shareLogs
    });
    renderUsers(users);
    renderActivityLog(localLogs);
    showAdminMessage("Firestore nu este accesibil. Afisez datele locale disponibile; verifica regulile Firestore.", "error");
  }
}

try {
  const authUser = await waitForAuth();
  const savedUser = getSavedAuthSession();
  const user = authUser?.emailVerified ? authUser : savedUser;

  if (!user) {
    window.location.href = "login.html";
  } else {
    currentUser = user;
    const profile = await getUserProfile(user);

    if (profile.role !== "admin") {
      window.location.href = "dashboard.html";
    } else {
      await renderAdminDashboard();
    }
  }
} catch (error) {
  console.error(error);
  showAdminMessage("Admin panel-ul nu poate accesa Firestore. Verifica regulile si indexurile.", "error");
}
