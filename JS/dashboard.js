import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCLdxgHBZjHBFiD-LEM4MF0fVFx-iBb1KQ",
  authDomain: "eazycrypt-92604.firebaseapp.com",
  projectId: "eazycrypt-92604",
  appId: "1:200384164661:web:a429f006ac8efd686ad27c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const adminCard = document.getElementById("adminCard");
const roleBadge = document.getElementById("roleBadge");

// Roluri demo pentru o aplicatie statica: adminii pot fi adaugati aici.
const demoAdminEmails = [
  "admin@eazycrypt.local"
];

function t(key, fallback) {
  return window.getTranslation ? window.getTranslation(key) : fallback;
}

function getUserRole(user) {
  const savedRole = localStorage.getItem(`role:${user.email}`);

  if (savedRole === "admin" || savedRole === "user") {
    return savedRole;
  }

  return demoAdminEmails.includes((user.email || "").toLowerCase()) ? "admin" : "user";
}

function applyRole(role) {
  localStorage.setItem("currentRole", role);

  if (roleBadge) {
    roleBadge.textContent = `${t("currentRole", "Current role")}: ${role}`;
  }

  if (adminCard) {
    adminCard.classList.toggle("hidden", role !== "admin");
  }
}

window.addEventListener("languageChanged", () => {
  const role = localStorage.getItem("currentRole");

  if (role) {
    applyRole(role);
  }
});

onAuthStateChanged(auth, (user) => {
  if (!user || !user.emailVerified) {
    window.location.href = "login.html";
    return;
  }

  applyRole(getUserRole(user));
});

document.getElementById("logoutBtn").onclick = () => {
  localStorage.removeItem("currentRole");

  signOut(auth).then(() => {
    window.location.href = "login.html";
  });
};
