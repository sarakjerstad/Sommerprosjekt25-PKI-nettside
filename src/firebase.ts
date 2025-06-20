// src/firebase.ts
import admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import serviceAccount from '../serviceAccountKey.json';

dotenv.config();

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount)
});

const db = admin.firestore();
export { db };
