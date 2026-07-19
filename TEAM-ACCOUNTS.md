# Team accounts (Owner creates logins)

Clearline lets the **Owner** create Manager/Worker accounts with a **username + password** (no email required). Crew sign in on `signin.html` with that username — not Google.

## One-time Firebase setup

1. Firebase Console → **Authentication** → **Sign-in method**
2. Enable **Email/Password** (required even though users type a username — Auth stores `username@clearline.invalid` under the hood)
3. Deploy Firestore rules from this repo (`firestore.rules` must allow `ownerProvisioningUser`)
4. Deploy Cloud Functions (password set + Auth rollback):
   ```bash
   cd functions && npm install
   firebase deploy --only functions
   ```

## Create an account

1. Sign in as Owner (Google)
2. **More → Team** (Manager panel) → **New Manager** or **New Worker**
3. Fill display name + username; a password is generated for you
4. Permissions default by role (Assigned worker vs Estimator vs Manager) — tweak if needed
5. Tap **Create account** → copy sheet appears → text them the username + password

They open Clearline → **Sign In** → Username / Password (not Google).

## Reset a password

Edit the user → enter/generate a new password → **Set password now**.  
This calls the `setUserPassword` Cloud Function (Admin SDK). Email reset will never work for `@clearline.invalid` usernames.

Managers can set passwords for **their assigned workers** only.

## Deactivate

Uncheck **Account active** on Edit and Save. They will be signed out / blocked on next load.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `auth/operation-not-allowed` | Enable Email/Password in Authentication |
| `permission-denied` on create | Deploy latest `firestore.rules` |
| Set password says Functions unavailable | Deploy `functions/` (`setUserPassword`) |
| `notprovisioned` on sign-in | Profile missing — recreate user or check Firestore `users/{uid}` |
| Username already registered | Pick another username, or set a new password on the existing user |
