# Android signing key

Android installs an update only if it is signed with the **same key** as the installed app. Whoever holds that key controls who can update every installed copy, and losing it means no installed copy can ever be updated, only uninstalled and reinstalled.

## What is in use today

- Release APKs (built by `.github/workflows/deploy.yml`) are signed with the debug keystore of the maintainer's machine, `~/.android/debug.keystore` (alias `androiddebugkey`, password `android`). Its base64 is in the repository secret `ANDROID_KEYSTORE_BASE64`, with the other three secrets listed in the README.
- Google Drive sign-in is tied to this key: the Android OAuth client in the Google Cloud project holds its **SHA-1**.
- The certificate's fingerprints are published in `version.json` (the `signing` field) and on the site's "Is this APK safe?" section, so anyone can compare.

Whether the keystore file exists only on that one machine can't be seen from the repository: confirm where the copies are.

## Back it up (whatever is decided below)

GitHub secrets are write-only: the secret is **not** a backup, since nobody can read it back.

1. Copy `~/.android/debug.keystore` somewhere that is not that machine's disk: an encrypted archive in two places (for example a password manager's file attachment plus an encrypted USB stick).
2. Write down the alias and both passwords next to it (not in the repository).
3. Check it opens: `keytool -list -v -keystore <copy> -storepass android -alias androiddebugkey` should print `SHA1:` matching the app's Drive OAuth client and the fingerprint on the site.

## Should it move to a proper release key?

The debug key is a standard Android-generated key with a publicly known password. That only protects against someone who also gets the file, and the file is the real secret either way, so a "release" key is not stronger by itself. What a move buys is: a key made for this purpose, kept in the right places from the start, with a name that doesn't say "Android Debug" on the certificate.

What it costs, because installed apps are signed with the old key:

- Testers can't update in place. They need to uninstall and reinstall, so they must first export a backup (the in-app updater also writes one to `Documents/BoulderTracker`) and restore it afterwards, or use Drive sync to bring the data back.
- Drive sync needs a new **Android OAuth client** in the same Google Cloud project, with package name `com.nzumbusch.bouldertracker` and the **new** key's SHA-1. Keep the old client until nobody uses the old build.
- Android 9+ supports signing-key rotation (APK Signature Scheme v3 lineage, `apksigner rotate`), which lets an app signed with the old key update to the new one. It does not work on Android 8 (the app's minimum), and I haven't tested it with this build setup. Look into it before asking testers to reinstall.

Cheapest moment: before the public post, while few copies exist. After it, the same move costs every new user a reinstall.

## If the key is moved (steps)

1. Create the key, on your machine, never in the repository:
   `keytool -genkeypair -v -keystore boulder-tracker-release.keystore -alias boulder-tracker -keyalg RSA -keysize 4096 -validity 10000`
2. Back it up as above, **before** anything else uses it.
3. Update the four repository secrets (`ANDROID_KEYSTORE_BASE64` via `base64 -w0 boulder-tracker-release.keystore`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`).
4. Add the Android OAuth client with the new SHA-1 (`keytool -list -v -keystore boulder-tracker-release.keystore -alias boulder-tracker`).
5. Push to `main`, then run the workflow's "promote" mode once the new build is verified on a clean device. Check the site shows the new fingerprint.
6. Update the README's secrets table and this file.
