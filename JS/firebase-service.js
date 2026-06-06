import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCLdxgHBZjHBFiD-LEM4MF0fVFx-iBb1KQ",
  authDomain: "eazycrypt-92604.firebaseapp.com",
  projectId: "eazycrypt-92604",
  storageBucket: "eazycrypt-92604.firebasestorage.app",
  messagingSenderId: "200384164661",
  appId: "1:200384164661:web:a429f006ac8efd686ad27c",
  measurementId: "G-G8VEQH03E7"
};

export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const defaultAdminEmails = [
  "xc4m0o@gmail.com",
  "admin@eazycrypt.local"
];

export function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

export function getLocalRoleOverride(email) {
  try {
    const roles = JSON.parse(localStorage.getItem("eazycryptRoleOverrides") || "{}");
    return roles[normalizeEmail(email)] || null;
  } catch {
    return null;
  }
}

export function setLocalRoleOverride(email, role) {
  try {
    const roles = JSON.parse(localStorage.getItem("eazycryptRoleOverrides") || "{}");
    roles[normalizeEmail(email)] = role;
    localStorage.setItem("eazycryptRoleOverrides", JSON.stringify(roles));
  } catch (error) {
    console.warn("Could not save local role override.", error);
  }
}

export function getFallbackRole(user) {
  if (!user) {
    return "guest";
  }

  const localRole = getLocalRoleOverride(user.email);

  if (localRole) {
    return localRole;
  }

  return defaultAdminEmails.includes(normalizeEmail(user.email)) ? "admin" : "user";
}

export function getSavedAuthSession() {
  try {
    const session = JSON.parse(localStorage.getItem("eazycryptAuthSession") || "null");

    if (!session?.uid || !session?.email) {
      return null;
    }

    return {
      uid: session.uid,
      email: session.email,
      role: getFallbackRole(session) === "admin" ? "admin" : (session.role || getFallbackRole(session)),
      emailVerified: true,
      localSession: true
    };
  } catch {
    return null;
  }
}

export function waitForAuth() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    })
  ]);
}

export async function ensureUserProfile(user) {
  if (!user) {
    return null;
  }

  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);
  const fallbackRole = getFallbackRole(user);
  const existing = snapshot.exists() ? snapshot.data() : {};
  const role = fallbackRole === "admin" ? "admin" : (getLocalRoleOverride(user.email) || existing.role || fallbackRole);
  const status = existing.status || "active";

  await setDoc(userRef, {
    uid: user.uid,
    email: user.email || "",
    role,
    status,
    createdAt: existing.createdAt || serverTimestamp(),
    lastLoginAt: serverTimestamp(),
    emailVerified: Boolean(user.emailVerified)
  }, { merge: true });

  await setDoc(doc(db, "userMetadata", user.uid), {
    uid: user.uid,
    email: user.email || "",
    role,
    status,
    lastSeenAt: serverTimestamp()
  }, { merge: true });

  return { uid: user.uid, email: user.email || "", role, status };
}

export async function getUserProfile(user) {
  if (!user) {
    return { uid: null, email: "", role: "guest" };
  }

  try {
    return await withTimeout(
      ensureUserProfile(user),
      2500,
      "Firestore profile timeout"
    );
  } catch (error) {
    console.warn("Could not load Firestore profile, using fallback role.", error);
    return { uid: user.uid, email: user.email || "", role: getFallbackRole(user), status: "active" };
  }
}

function getLocalActivityKey(user) {
  return `eazycryptLocalActivity:${user.uid}`;
}

export function saveLocalActivityLog(user, metadata, profile = null) {
  if (!user?.uid) {
    return null;
  }

  const role = profile?.role || user.role || getFallbackRole(user);
  const safeLog = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    uid: user.uid,
    email: user.email || "",
    role,
    actionType: metadata.actionType || "unknown",
    targetType: metadata.targetType || "unknown",
    cryptoType: metadata.cryptoType || "AES-GCM 256-bit",
    fileName: metadata.fileName || null,
    fileSize: metadata.fileSize || null,
    status: metadata.status || "success",
    method: metadata.method || null,
    date: new Date().toISOString(),
    localOnly: true
  };

  try {
    const key = getLocalActivityKey(user);
    const existing = JSON.parse(localStorage.getItem(key) || "[]");
    localStorage.setItem(key, JSON.stringify([safeLog, ...existing].slice(0, 200)));
  } catch (error) {
    console.warn("Could not save local activity metadata.", error);
  }

  return safeLog;
}

export function getLocalActivityLogs(user, maxItems = 50) {
  if (!user?.uid) {
    return [];
  }

  try {
    return JSON.parse(localStorage.getItem(getLocalActivityKey(user)) || "[]").slice(0, maxItems);
  } catch {
    return [];
  }
}

export async function logActivity(user, metadata) {
  if (!user) {
    return null;
  }

  const profile = await getUserProfile(user);
  const status = metadata.status || "success";
  const actionType = metadata.actionType || "unknown";
  const targetType = metadata.targetType || "unknown";
  const safeLog = {
    uid: user.uid,
    email: user.email || "",
    role: profile.role,
    actionType,
    targetType,
    cryptoType: metadata.cryptoType || "AES-GCM 256-bit",
    fileName: metadata.fileName || null,
    fileSize: metadata.fileSize || null,
    status,
    timestamp: serverTimestamp(),
    date: new Date().toISOString()
  };

  try {
    const result = await addDoc(collection(db, "activityLogs"), safeLog);

    await setDoc(doc(db, "userMetadata", user.uid), {
      uid: user.uid,
      email: user.email || "",
      role: profile.role,
      lastActivityAt: serverTimestamp(),
      totalActivities: increment(1),
      [`${actionType}Count`]: increment(1)
    }, { merge: true });

    saveLocalActivityLog(user, metadata, profile);
    return result;
  } catch (error) {
    console.warn("Firestore activity log failed, using local metadata fallback.", error);
    return saveLocalActivityLog(user, metadata, profile);
  }
}

export async function logShare(user, metadata) {
  if (!user) {
    return null;
  }

  const profile = await getUserProfile(user);
  const safeLog = {
    uid: user.uid,
    email: user.email || "",
    role: profile.role,
    actionType: "share",
    targetType: metadata.targetType || "unknown",
    fileName: metadata.fileName || null,
    status: metadata.status || "prepared",
    method: metadata.method || "mailto",
    timestamp: serverTimestamp(),
    date: new Date().toISOString()
  };

  try {
    await addDoc(collection(db, "shareLogs"), safeLog);
    await addDoc(collection(db, "activityLogs"), safeLog);

    await setDoc(doc(db, "userMetadata", user.uid), {
      uid: user.uid,
      email: user.email || "",
      role: profile.role,
      lastShareAt: serverTimestamp(),
      shareCount: increment(1),
      totalActivities: increment(1)
    }, { merge: true });

    saveLocalActivityLog(user, safeLog, profile);
  } catch (error) {
    console.warn("Firestore share log failed, using local metadata fallback.", error);
    saveLocalActivityLog(user, safeLog, profile);
  }
}

export async function getMyActivityLogs(user, maxItems = 50) {
  if (!user) {
    return [];
  }

  const localLogs = getLocalActivityLogs(user, maxItems);

  try {
    const activityQuery = query(
      collection(db, "activityLogs"),
      where("uid", "==", user.uid),
      limit(maxItems)
    );
    const snapshot = await getDocs(activityQuery);
    const firestoreLogs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

    return [...firestoreLogs, ...localLogs]
      .sort((a, b) => {
        const aTime = a.timestamp?.toMillis?.() || Date.parse(a.date || 0);
        const bTime = b.timestamp?.toMillis?.() || Date.parse(b.date || 0);
        return bTime - aTime;
      })
      .slice(0, maxItems);
  } catch (error) {
    console.warn("Could not load Firestore history, using local metadata fallback.", error);
    return localLogs
    .sort((a, b) => {
      const aTime = a.timestamp?.toMillis?.() || Date.parse(a.date || 0);
      const bTime = b.timestamp?.toMillis?.() || Date.parse(b.date || 0);
      return bTime - aTime;
    })
    .slice(0, maxItems);
  }
}

export async function getAdminData(maxItems = 100) {
  const [usersSnapshot, activitySnapshot, shareSnapshot] = await Promise.all([
    getDocs(query(collection(db, "users"), orderBy("email", "asc"))),
    getDocs(query(collection(db, "activityLogs"), orderBy("timestamp", "desc"), limit(maxItems))),
    getDocs(query(collection(db, "shareLogs"), orderBy("timestamp", "desc"), limit(maxItems)))
  ]);

  return {
    users: usersSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
    activityLogs: activitySnapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
    shareLogs: shareSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
  };
}

export async function updateUserRole(uid, role) {
  const userRef = doc(db, "users", uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    throw new Error("User profile not found.");
  }

  const userData = snapshot.data();
  setLocalRoleOverride(userData.email || "", role);

  await updateDoc(userRef, {
    role,
    updatedAt: serverTimestamp()
  });

  await setDoc(doc(db, "userMetadata", uid), {
    uid,
    email: userData.email || "",
    role,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function updateUserStatus(uid, status) {
  const userRef = doc(db, "users", uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    throw new Error("User profile not found.");
  }

  const userData = snapshot.data();

  await updateDoc(userRef, {
    status,
    updatedAt: serverTimestamp()
  });

  await setDoc(doc(db, "userMetadata", uid), {
    uid,
    email: userData.email || "",
    role: userData.role || "user",
    status,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export function formatLogDate(log) {
  if (log.timestamp?.toDate) {
    return log.timestamp.toDate().toLocaleString();
  }

  if (log.date) {
    return new Date(log.date).toLocaleString();
  }

  return "-";
}
