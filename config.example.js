// Clearline — Runtime Configuration Template
// Copy this file to config.js and fill in your values.
// config.js is gitignored and will NOT be committed.

window.CL_SECRETS = {
    firebase: {
        apiKey: "YOUR_FIREBASE_API_KEY",
        authDomain: "YOUR_PROJECT.firebaseapp.com",
        databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
        projectId: "YOUR_PROJECT",
        storageBucket: "YOUR_PROJECT.firebasestorage.app",
        messagingSenderId: "YOUR_SENDER_ID",
        appId: "YOUR_APP_ID",
        measurementId: "YOUR_MEASUREMENT_ID"
    },
    mapsApiKey: "YOUR_GOOGLE_MAPS_API_KEY",
    // Optional: hard-code the Owner's Firebase Auth uid. When set, the app
    // will only auto-bootstrap a `users/{uid}` doc with role='owner' if
    // the signed-in Google account matches this uid. Leave blank on a
    // brand-new project to let the first Google sign-in claim Owner.
    ownerUid: ""
};
