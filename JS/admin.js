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

const demoAdminEmails = [
  "xc4m0o@gmail.com",
  "admin@eazycrypt.local"
];

function getUserRole(user) {
  // Aceeasi regula simpla ca in dashboard: admin doar pentru emailurile aprobate.
  return demoAdminEmails.includes((user.email || "").toLowerCase()) ? "admin" : "user";
}

onAuthStateChanged(auth, (user) => {
  if (!user || !user.emailVerified) {
    window.location.href = "login.html";
    return;
  }

  // Pagina admin este disponibila doar rolului admin.
  if (getUserRole(user) !== "admin") {
    window.location.href = "dashboard.html";
  }
});
