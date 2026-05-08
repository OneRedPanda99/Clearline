"use client";

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  setPersistence,
  browserLocalPersistence,
  type Auth,
} from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  type Firestore,
} from "firebase/firestore";
import { getStorage, connectStorageEmulator, type FirebaseStorage } from "firebase/storage";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _storage: FirebaseStorage | null = null;

export function isFirebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.projectId && config.appId);
}

function ensureApp(): FirebaseApp {
  if (_app) return _app;
  if (!isFirebaseConfigured()) {
    throw new Error(
      "Firebase is not configured. Copy .env.local.example to .env.local and fill in your Firebase project values.",
    );
  }
  _app = getApps().length ? getApp() : initializeApp(config);
  return _app;
}

export function getFirebaseAuth(): Auth {
  if (_auth) return _auth;
  const app = ensureApp();
  _auth = getAuth(app);
  if (typeof window !== "undefined") {
    void setPersistence(_auth, browserLocalPersistence).catch(() => {});
    if (process.env.NEXT_PUBLIC_USE_EMULATORS === "1") {
      try {
        connectAuthEmulator(_auth, "http://127.0.0.1:9099", { disableWarnings: true });
      } catch {
        // already connected
      }
    }
  }
  return _auth;
}

export function getDb(): Firestore {
  if (_db) return _db;
  const app = ensureApp();
  _db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_USE_EMULATORS === "1") {
    try {
      connectFirestoreEmulator(_db, "127.0.0.1", 8080);
    } catch {
      // already connected
    }
  }
  return _db;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (_storage) return _storage;
  const app = ensureApp();
  _storage = getStorage(app);
  if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_USE_EMULATORS === "1") {
    try {
      connectStorageEmulator(_storage, "127.0.0.1", 9199);
    } catch {
      // already connected
    }
  }
  return _storage;
}
