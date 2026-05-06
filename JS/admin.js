import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCLdxgHBZjHBFiD-LEM4MF0fVFx-iBb1KQ",
  authDomain: "eazycrypt-92604.firebaseapp.com",
  projectId: "eazycrypt-92604",
  appId: "1:200384164661:web:a429f006ac8efd686ad27c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const defaultAdminEmails = [
  "xc4m0o@gmail.com",
  "admin@eazycrypt.local"
];
const adminStorageKey = "eazycryptAdminEmails";
const activityStorageKey = "eazycryptAdminActivity";

const adminEmailInput = document.getElementById("adminEmailInput");
const adminTableBody = document.getElementById("adminTableBody");
const adminMessage = document.getElementById("adminMessage");
const activityLog = document.getElementById("activityLog");

function t(key, fallback) {
  return window.getTranslation ? window.getTranslation(key) : fallback;
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function getCustomAdminEmails() {
  return readJson(adminStorageKey, []);
}

function saveCustomAdminEmails(emails) {
  localStorage.setItem(adminStorageKey, JSON.stringify([...new Set(emails)]));
}

function getAdminEmails() {
  return [...new Set([...defaultAdminEmails, ...getCustomAdminEmails()].map(normalizeEmail))];
}

function getUserRole(user) {
  return getAdminEmails().includes(normalizeEmail(user.email || "")) ? "admin" : "user";
}

function showAdminMessage(text, type) {
  adminMessage.textContent = text;
  adminMessage.className = `admin-message ${type}`;
}

function addActivity(text) {
  const activity = readJson(activityStorageKey, []);
  activity.unshift({
    text,
    date: new Date().toLocaleString()
  });

  localStorage.setItem(activityStorageKey, JSON.stringify(activity.slice(0, 8)));
}

function renderActivityLog() {
  const activity = readJson(activityStorageKey, []);

  activityLog.innerHTML = "";

  if (activity.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.textContent = t("emptyLog", "No actions yet.");
    activityLog.appendChild(emptyItem);
  }

  activity.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${item.date} - ${item.text}`;
    activityLog.appendChild(li);
  });

  document.getElementById("activityCount").textContent = activity.length;
}

function renderAdminTable() {
  const customAdmins = getCustomAdminEmails();
  const allAdmins = getAdminEmails();

  adminTableBody.innerHTML = "";

  allAdmins.forEach((email) => {
    const row = document.createElement("tr");
    const isDefaultAdmin = defaultAdminEmails.includes(email);

    row.innerHTML = `
      <td>${email}</td>
      <td>admin</td>
      <td></td>
    `;

    const actionCell = row.querySelector("td:last-child");
    const button = document.createElement("button");
    button.className = "table-action-btn";
    button.textContent = isDefaultAdmin ? t("protectedAdmin", "Protected") : t("remove", "Remove");
    button.disabled = isDefaultAdmin;

    if (!isDefaultAdmin) {
      button.addEventListener("click", () => {
        saveCustomAdminEmails(customAdmins.filter((adminEmail) => adminEmail !== email));
        addActivity(`${t("removedAdmin", "Removed admin")}: ${email}`);
        showAdminMessage(t("adminRemoved", "Admin removed from local list."), "info");
        renderAdminDashboard();
      });
    }

    actionCell.appendChild(button);
    adminTableBody.appendChild(row);
  });

  document.getElementById("adminCount").textContent = allAdmins.length;
  document.getElementById("normalUserCount").textContent = t("demoOnly", "Demo");
}

function renderAdminDashboard() {
  renderAdminTable();
  renderActivityLog();
}

document.getElementById("addAdminBtn").addEventListener("click", () => {
  const email = normalizeEmail(adminEmailInput.value);

  if (!email || !email.includes("@")) {
    showAdminMessage(t("invalidAdminEmail", "Enter a valid email."), "error");
    return;
  }

  if (getAdminEmails().includes(email)) {
    showAdminMessage(t("adminAlreadyExists", "This email is already admin."), "error");
    return;
  }

  saveCustomAdminEmails([...getCustomAdminEmails(), email]);
  addActivity(`${t("addedAdmin", "Added admin")}: ${email}`);
  adminEmailInput.value = "";
  showAdminMessage(t("adminAdded", "Admin added locally."), "success");
  renderAdminDashboard();
});

document.getElementById("clearLogBtn").addEventListener("click", () => {
  localStorage.removeItem(activityStorageKey);
  showAdminMessage(t("logCleared", "Activity log cleared."), "info");
  renderAdminDashboard();
});

window.addEventListener("languageChanged", renderAdminDashboard);

onAuthStateChanged(auth, (user) => {
  if (!user || !user.emailVerified) {
    window.location.href = "login.html";
    return;
  }

  // Pagina admin este disponibila doar rolului admin.
  if (getUserRole(user) !== "admin") {
    window.location.href = "dashboard.html";
    return;
  }

  renderAdminDashboard();
});
