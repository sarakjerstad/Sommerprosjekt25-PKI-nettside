# CA Nettside

A `React + Express + Firebase` project for uploading CSR files and saving them to Firestore. Includes a backend signing script for certificate requests.

---

## Prerequisites

- **Node.js** (v18 or newer recommended)  
- **npm** (comes with Node.js)  
- **Firebase Project** with Firestore enabled  
- Firebase **Service Account JSON** file  
- `openssl` command line tool installed (for signing CSRs)  
- `jq` command line tool installed (used in the signing script)  

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/your-username/your-repo.git
cd your-repo
```

### 2. Install dependencies

```bash
npm install
```
This installs:
- `express` - Web server framework
- `firebase-admin` - Firebase Admin SDK (for backend)
- `firebase` - Firebase Client SDK (for frontend)
- `react`, `react-dom` - React frontend libraries
- `typescript`, `ts-node` - TypeScript support
- `dotenv` - Load enviornment variables
- Other utility libraries (archiver, unzipper, etc.)

### 3. Configure enviornment variables

Create a `.env` file in the project root (next to `package.json`) with the following variables (fill with your firebase project config):

```env
FIREBASE_API_KEY=""
FIREBASE_AUTH_DOMAIN=""
FIREBASE_PROJECT_ID=""
FIREBASE_STORAGE_BUCKET=""
FIREBASE_MESSAGING_SENDER_ID="1"
FIREBASE_APP_ID=""
```
This can be found by making you Firebase project a web app. Then you can click the cog wheel next to "Project Overview" -> "Your apps" -> Click the name of your wesite and it should be under "SDK setup and configuration"

### 4. Add Firebase service account key

1. Go to Firebase Console -> Project Settings -> Service Accounts
2. Click *Generate new privatre key*
3. Rename the downloaded JSON file to `serviceAccountKey.json`
4. Place it in the root of the project directory (same level as `.env`)

Make sure the path matches in `src/firebase.ts`

### 5. Running the server

Start the Express + React server:

```bash
npm run start
```

The server will run at whichever mode you've chosen at the bottom of `server.ts`

### 6. Using the app

- Open your browser to http:/localhost:3000
- Upload a CSR (Certificate Signing Request) file using the provided React form
- The backend saves CSR data to Firestore

--- 

## Certificate Signing Script (signScript.sh)

This bash script is used to:
- Fetch a CSR from Firestore using the document ID
- Save the CSR locally
- Sign the CSR with a local CA certificate and key
- Output the signed certificate

### Usage
```bash
./GPTscript.sh <document_id>
```

Where `<document_id>` is the Firestore document ID containing the CSR.


### Prerequisites for signing

- `openssl` installed and accessible in your PATH
- `jq` installed to parse JSON (install via `sudo apt install jq` or equivalent)- Correct CA certificate and key paths set in the script:

```bash
CA_CERT_PATH="/CA/certs/rootCA1.cert.pem" #Route to CA-certificate
CA_KEY_PATH="/CA/rootCA1.key.pem" #Route to CA-key
CSR_DIR="/home/tsvuser/bashScripts/csrTest" #A little unsure...
CERT_OUTPUT_DIR="/CA/newcerts" #Route to certificate directory
```

- CA private key password hardcoded in the script (replace `ca1passwd'* with your actual password or improve script security)

---

## Project Structure

```bash
/public
  homepage.html            # React frontend HTML (served statically)
  downloadcerts.html       # React frontend HTML
  styles.css               # For aethetics
/src
  firebase.ts           # Firebase Admin initialization
  server.ts             # Express backend server
serviceAccountKey.json  # Firebase service account key (private)
.env                    # Environment variables
package.json            # Project dependencies and scripts
signScript.sh           # Bash script to fetch and sign CSRs (Known as GPTscript in code, but signScript.sh is the same)
```

--- 

## Troubleshooting

- **Error: Cannot find module 'ts-node'**
  Run `npm install` to ensure dependencies are installed.

- **Firebase permissions errors**
  Verify your service account key and Firestore security rules allow write access.

- **Environment variables not loading**
  Ensure `.env` is in the root folder and variables are correctly formatted (no trailing commas).

- **`jq` not found in signing script**
  Install `jq` with your package manager (e.g., `sudo apt install jq`).

--- 
## Notes & Recommendations

- The signing script currently uses a hardcoded CA key password — consider improving this for security.
- This project serves the React frontend statically via Express; you can customize React by editing /public/index.html or replace with your React app build.
- Make sure your Firebase project has Firestore enabled and rules allow the necessary read/write permissions.
