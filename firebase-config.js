// عدّلي القيم التالية بالقيم اللي بتاخذيها من Firebase Console
// (Project settings → General → Your apps → SDK setup and configuration)
// القيم هذه "عامة" وآمن نشرها في كود الموقع - الحماية الفعلية تكون عبر
// قواعد Firestore/Storage (راجعي firestore.rules.txt و storage.rules.txt)

export const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "PASTE_YOUR_PROJECT.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_PROJECT.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID",
};

// لا تلمسي هذا السطر - بيحدد تلقائيًا إذا كان لازم يشتغل بالوضع السحابي
export const FIREBASE_ENABLED = firebaseConfig.apiKey !== "PASTE_YOUR_API_KEY";
