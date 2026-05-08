"use client";

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

import { getFirebaseStorage } from "@/lib/firebase/client";

function randId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function uploadJobPhoto(orgId: string, jobId: string, file: File) {
  const storage = getFirebaseStorage();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `orgs/${orgId}/jobs/${jobId}/photos/${randId()}.${ext}`;
  const r = ref(storage, path);
  await uploadBytes(r, file, { contentType: file.type });
  const url = await getDownloadURL(r);
  return { storagePath: path, url };
}

export async function uploadReceipt(orgId: string, expenseId: string, file: File) {
  const storage = getFirebaseStorage();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `orgs/${orgId}/expenses/${expenseId}/receipt/${randId()}.${ext}`;
  const r = ref(storage, path);
  await uploadBytes(r, file, { contentType: file.type });
  const url = await getDownloadURL(r);
  return { storagePath: path, url };
}
