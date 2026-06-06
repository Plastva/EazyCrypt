import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  auth,
  waitForAuth,
  getUserProfile,
  getSavedAuthSession,
  getMyActivityLogs
} from "./firebase-service.js";

const adminCard = document.getElementById("adminCard");
const historyCard = document.getElementById("historyCard");
const roleBadge = document.getElementById("roleBadge");
const logoutBtn = document.getElementById("logoutBtn");
const accountMenuWrap = document.getElementById("accountMenuWrap");
const menuToggle = document.getElementById("menuToggle");
const accountMenu = document.getElementById("accountMenu");
const menuEmail = document.getElementById("menuEmail");
const menuRole = document.getElementById("menuRole");
const menuActivityCount = document.getElementById("menuActivityCount");

let currentProfile = { role: "guest", email: "" };
let currentUser = null;
let sessionReady = false;
const authRedirect = new URLSearchParams(window.location.search).get("auth") === "1"
  || sessionStorage.getItem("eazycryptLoginRedirect") === "true";

function t(key, fallback) {
  return window.getTranslation ? window.getTranslation(key) : fallback;
}

function setVisible(element, visible) {
  if (!element) {
    return;
  }

  element.hidden = !visible;
  element.classList.toggle("hidden", !visible);
}

function applyRole(profile) {
  const role = profile?.role || "guest";
  sessionReady = true;
  currentProfile = profile || { role: "guest", email: "" };
  localStorage.setItem("currentRole", role);

  if (roleBadge) {
    roleBadge.textContent = `${t("currentRole", "Current role")}: ${role}`;
  }

  setVisible(adminCard, role === "admin");
  setVisible(historyCard, role !== "guest");
  setVisible(accountMenuWrap, role !== "guest");

  if (logoutBtn) {
    logoutBtn.textContent = role === "guest" ? "Login" : t("logout", "Logout");
    logoutBtn.disabled = false;
  }

  if (menuEmail) {
    menuEmail.textContent = profile.email || "Guest";
  }

  if (menuRole) {
    menuRole.textContent = `${t("roleLabel", "Rol")}: ${role}`;
  }
}

function showSessionLoading() {
  sessionReady = false;
  setVisible(adminCard, false);
  setVisible(historyCard, false);
  setVisible(accountMenuWrap, false);

  if (roleBadge) {
    roleBadge.textContent = "Se verifica sesiunea...";
  }

  if (logoutBtn) {
    logoutBtn.textContent = "...";
    logoutBtn.disabled = true;
  }
}

async function loadMenuStats() {
  if (!currentUser || currentProfile.role === "guest") {
    return;
  }

  try {
    const logs = await getMyActivityLogs(currentUser, 20);
    menuActivityCount.textContent = logs.length;
  } catch (error) {
    console.warn("Could not load menu stats.", error);
    menuActivityCount.textContent = "0";
  }
}

function closeMenu() {
  accountMenu?.classList.add("hidden");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForUserAfterLoginRedirect() {
  let user = await waitForAuth();

  if (user || !authRedirect) {
    return user;
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    await sleep(300);

    if (auth.currentUser) {
      return auth.currentUser;
    }
  }

  return auth.currentUser;
}

window.addEventListener("languageChanged", () => {
  if (!sessionReady) {
    return;
  }

  applyRole(currentProfile);
});

menuToggle?.addEventListener("click", (event) => {
  event.stopPropagation();
  accountMenu.classList.toggle("hidden");
});

document.addEventListener("click", (event) => {
  if (!accountMenuWrap?.contains(event.target)) {
    closeMenu();
  }
});

document.getElementById("menuHistoryBtn")?.addEventListener("click", () => {
  window.location.href = "history.html";
});

document.getElementById("menuAccountBtn")?.addEventListener("click", () => {
  window.location.href = "account.html";
});

logoutBtn.onclick = async () => {
  if (!sessionReady) {
    return;
  }

  if (!currentUser) {
    localStorage.removeItem("eazycryptGuestMode");
    localStorage.removeItem("eazycryptAuthSession");
    sessionStorage.removeItem("eazycryptLoginRedirect");
    window.location.href = "login.html";
    return;
  }

  localStorage.removeItem("currentRole");
  localStorage.removeItem("eazycryptGuestMode");
  localStorage.removeItem("eazycryptAuthSession");
  sessionStorage.removeItem("eazycryptLoginRedirect");
  await signOut(auth);
  window.location.href = "login.html";
};

showSessionLoading();
const user = await waitForUserAfterLoginRedirect();
currentUser = user?.emailVerified ? user : null;
const savedAuthSession = getSavedAuthSession();

if (currentUser) {
  localStorage.removeItem("eazycryptGuestMode");
  sessionStorage.removeItem("eazycryptLoginRedirect");
  const immediateProfile = savedAuthSession || {
    uid: currentUser.uid,
    email: currentUser.email || "",
    role: "user"
  };

  applyRole(immediateProfile);
  loadMenuStats();
  getUserProfile(currentUser).then((profile) => {
    if (profile.status === "deleted") {
      localStorage.removeItem("currentRole");
      localStorage.removeItem("eazycryptGuestMode");
      localStorage.removeItem("eazycryptAuthSession");
      sessionStorage.removeItem("eazycryptLoginRedirect");
      signOut(auth).finally(() => {
        window.location.href = "login.html";
      });
      return;
    }

    applyRole(profile);
    loadMenuStats();
  }).catch((error) => {
    console.warn("Rolul Firestore nu a putut fi incarcat.", error);
  });
} else if (savedAuthSession) {
  localStorage.removeItem("eazycryptGuestMode");
  sessionStorage.removeItem("eazycryptLoginRedirect");
  applyRole(savedAuthSession);
} else {
  if (!authRedirect && localStorage.getItem("eazycryptGuestMode") === "true") {
    applyRole({ role: "guest", email: "" });
  } else {
    localStorage.removeItem("eazycryptGuestMode");
    sessionStorage.removeItem("eazycryptLoginRedirect");
    window.location.href = "login.html";
  }
}
