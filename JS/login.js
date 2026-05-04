import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCLdxgHBZjHBFiD-LEM4MF0fVFx-iBb1KQ",
  authDomain: "eazycrypt-92604.firebaseapp.com",
  projectId: "eazycrypt-92604",
  storageBucket: "eazycrypt-92604.firebasestorage.app",
  messagingSenderId: "200384164661",
  appId: "1:200384164661:web:a429f006ac8efd686ad27c",
  measurementId: "G-G8VEQH03E7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const loginBox = document.getElementById("loginBox");
const registerBox = document.getElementById("registerBox");
const messageBox = document.getElementById("messageBox");

const registerPassword = document.getElementById("registerPassword");

function showMessage(text, type) {
  messageBox.textContent = text;
  messageBox.className = `message ${type}`;
}

function clearMessage() {
  messageBox.textContent = "";
  messageBox.className = "message hidden";
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

function isStrongPassword(password) {
  const rules = checkPasswordRules(password);
  return rules.length && rules.upper && rules.lower && rules.number && rules.symbol;
}

function updatePasswordRules() {
  const password = registerPassword.value;
  const rules = checkPasswordRules(password);

  document.getElementById("ruleLength").classList.toggle("valid", rules.length);
  document.getElementById("ruleUpper").classList.toggle("valid", rules.upper);
  document.getElementById("ruleLower").classList.toggle("valid", rules.lower);
  document.getElementById("ruleNumber").classList.toggle("valid", rules.number);
  document.getElementById("ruleSymbol").classList.toggle("valid", rules.symbol);
}

registerPassword.addEventListener("input", updatePasswordRules);

document.getElementById("toRegister").onclick = () => {
  clearMessage();
  loginBox.classList.add("hidden");
  registerBox.classList.remove("hidden");
};

document.getElementById("toLogin").onclick = () => {
  clearMessage();
  registerBox.classList.add("hidden");
  loginBox.classList.remove("hidden");
};

document.getElementById("registerBtn").onclick = () => {
  const email = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value;

  if (!email || !password) {
    showMessage("Completează emailul și parola.", "error");
    return;
  }

  if (!isStrongPassword(password)) {
    showMessage("Parola trebuie să respecte toate regulile de securitate.", "error");
    return;
  }

  showMessage("Se creează contul...", "info");

  createUserWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      sendEmailVerification(userCredential.user)
        .then(() => {
          showMessage("Cont creat cu succes! Verifică emailul pentru confirmare.", "success");
        });
    })
    .catch((error) => {
      showMessage(getFirebaseErrorMessage(error.code), "error");
    });
};

document.getElementById("loginBtn").onclick = () => {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!email || !password) {
    showMessage("Introdu emailul și parola.", "error");
    return;
  }

  showMessage("Se verifică datele...", "info");

  signInWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      if (userCredential.user.emailVerified) {
        showMessage("Login reușit! Se deschide aplicația...", "success");

        setTimeout(() => {
          window.location.href = "dashboard.html";
        }, 900);
      } else {
        showMessage("Confirmă emailul înainte de a intra în aplicație.", "error");
      }
    })
    .catch((error) => {
      showMessage(getFirebaseErrorMessage(error.code), "error");
    });
};

function getFirebaseErrorMessage(code) {
  switch (code) {
    case "auth/email-already-in-use":
      return "Acest email este deja folosit.";
    case "auth/invalid-email":
      return "Emailul introdus nu este valid.";
    case "auth/weak-password":
      return "Parola este prea slabă.";
    case "auth/user-not-found":
      return "Nu există cont cu acest email.";
    case "auth/wrong-password":
      return "Parola este greșită.";
    case "auth/invalid-credential":
      return "Email sau parolă incorectă.";
    case "auth/too-many-requests":
      return "Prea multe încercări. Încearcă mai târziu.";
    default:
      return "A apărut o eroare. Încearcă din nou.";
  }
}