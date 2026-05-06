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
  "xc4m0o@gmail.com",
  "admin@eazycrypt.local"
];

function t(key, fallback) {
  return window.getTranslation ? window.getTranslation(key) : fallback;
}

function getUserRole(user) {
  // In varianta demo rolul admin este acordat strict emailurilor din lista.
  return demoAdminEmails.includes((user.email || "").toLowerCase()) ? "admin" : "user";
}

function applyRole(role) {
  localStorage.setItem("currentRole", role);

  if (roleBadge) {
    roleBadge.textContent = `${t("currentRole", "Current role")}: ${role}`;
  }

  if (adminCard) {
    const isAdmin = role === "admin";

    adminCard.hidden = !isAdmin;
    adminCard.classList.toggle("hidden", !isAdmin);
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
