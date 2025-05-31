import admin from "firebase-admin"
import { formatPrivateKey } from "../utils/formatPrivatekey"
import FirebaseAdminAppParams from "../interface/firebaseAdmin.interface"

export function createFirebaseAdminApp(params: FirebaseAdminAppParams) {
  const privateKey = formatPrivateKey(params.privateKey)

//   Try not to attempt creating the firebase admin app more than once
  if (admin.apps.length > 0) {
    return admin.app()
  }

  const cert = admin.credential.cert({
    projectId: params.projectId,
    clientEmail: params.clientEmail,
    privateKey,
  })

  return admin.initializeApp({
    credential: cert,
    projectId: params.projectId,
    storageBucket: params.storageBucket,
  })
}

// Firebase Init
export async function initAdmin() {
  const params = {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID as string,
    clientEmail: process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL as string,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET as string,
    privateKey: process.env.NEXT_PUBLIC_FIREBASE_PRIVATE_KEY as string,
  }

  return createFirebaseAdminApp(params)
}