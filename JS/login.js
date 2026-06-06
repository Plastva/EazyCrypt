import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth, ensureUserProfile, getFallbackRole, getUserProfile } from "./firebase-service.js";

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

async function saveProfileWithoutBlockingLogin(user) {
  try {
    await ensureUserProfile(user);
    return true;
  } catch (error) {
    console.warn("Profilul Firestore nu a putut fi salvat, dar autentificarea continua.", error);
    return false;
  }
}

function saveProfileInBackground(user) {
  saveProfileWithoutBlockingLogin(user);
}

function saveAuthenticatedSession(user, profile = null) {
  const session = {
    uid: user.uid,
    email: user.email || "",
    role: profile?.role || getFallbackRole(user),
    savedAt: Date.now()
  };

  localStorage.setItem("eazycryptAuthSession", JSON.stringify(session));
  sessionStorage.setItem("eazycryptLoginRedirect", "true");
  localStorage.removeItem("eazycryptGuestMode");
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

async function registerUser() {
  const email = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value;

  if (!email || !password) {
    showMessage("Completeaza emailul si parola.", "error");
    return;
  }

  if (!isStrongPassword(password)) {
    showMessage("Parola trebuie sa respecte toate regulile de securitate.", "error");
    return;
  }

  showMessage("Se creeaza contul...", "info");

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(userCredential.user);
    saveProfileInBackground(userCredential.user);
    showMessage("Cont creat cu succes! Verifica emailul pentru confirmare.", "success");
  } catch (error) {
    console.error("Register error:", error);
    showMessage(getFirebaseErrorMessage(error), "error");
  }
}

async function loginUser() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  localStorage.removeItem("eazycryptGuestMode");
  sessionStorage.removeItem("eazycryptLoginRedirect");

  if (!email || !password) {
    showMessage("Introdu emailul si parola.", "error");
    return;
  }

  showMessage("Se verifica datele...", "info");

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);

    if (!userCredential.user.emailVerified) {
      sendEmailVerification(userCredential.user).catch((error) => {
        console.warn("Emailul de verificare nu a putut fi retrimis.", error);
      });
      showMessage("Confirma emailul inainte de a intra in aplicatie. Am incercat sa retrimit emailul de verificare.", "error");
      return;
    }

    const profile = await getUserProfile(userCredential.user);

    if (profile.status === "deleted") {
      await signOut(auth);
      localStorage.removeItem("eazycryptAuthSession");
      showMessage("Acest cont a fost dezactivat de administrator.", "error");
      return;
    }

    saveAuthenticatedSession(userCredential.user, profile);
    saveProfileInBackground(userCredential.user);
    showMessage("Login reusit! Se deschide aplicatia...", "success");

    setTimeout(() => {
      window.location.href = "dashboard.html?auth=1";
    }, 900);
  } catch (error) {
    console.error("Login error:", error);
    showMessage(getFirebaseErrorMessage(error), "error");
  }
}

function continueAsGuest() {
  sessionStorage.removeItem("eazycryptLoginRedirect");
  localStorage.removeItem("eazycryptAuthSession");
  localStorage.setItem("eazycryptGuestMode", "true");
  window.location.href = "dashboard.html";
}

document.getElementById("registerBtn").onclick = registerUser;
document.getElementById("loginBtn").onclick = loginUser;
document.getElementById("guestBtn")?.addEventListener("click", continueAsGuest);

["loginEmail", "loginPassword"].forEach((id) => {
  document.getElementById(id).addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      loginUser();
    }
  });
});

function getFirebaseErrorMessage(error) {
  const code = error?.code || "unknown";

  switch (code) {
    case "auth/email-already-in-use":
      return "Acest email este deja folosit.";
    case "auth/invalid-email":
      return "Emailul introdus nu este valid.";
    case "auth/weak-password":
      return "Parola este prea slaba.";
    case "auth/user-not-found":
      return "Nu exista cont cu acest email.";
    case "auth/wrong-password":
      return "Parola este gresita.";
    case "auth/invalid-credential":
      return "Email sau parola incorecta.";
    case "auth/too-many-requests":
      return "Prea multe incercari. Incearca mai tarziu.";
    case "permission-denied":
      return "Autentificarea a reusit, dar Firestore blocheaza salvarea profilului. Verifica regulile Firestore.";
    case "unavailable":
      return "Firebase este momentan indisponibil. Incearca din nou.";
    case "failed-precondition":
      return "Firestore are nevoie de configurare suplimentara in Firebase Console.";
    default:
      return `A aparut o eroare (${code}). Incearca din nou.`;
  }
}
