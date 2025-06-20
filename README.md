## CA Nettside

A React + Express + Firebase project for uploading CSR files and saving them to Firestore.
Prerequisites

    Node.js (recommended version 18 or newer)

    npm (comes bundled with Node.js)

    A Firebase project with a service account JSON file downloaded.

## Getting Started
# 1. Clone the repository

git clone https://github.com/your-username/your-repo.git
cd your-repo

# 2. Install dependencies

Run the following command to install all required dependencies:

npm install

This installs:

    express — web server framework

    firebase-admin — Firebase Admin SDK for backend access

    firebase — Firebase client SDK (if used in frontend)

    react and react-dom — frontend UI library

    typescript and ts-node — TypeScript support and execution

    dotenv — load environment variables from .env

    TypeScript type definitions for Node and Express

# 3. Environment setup

Create a .env file in the project root and add your Firebase configuration variables:

FIREBASE_API_KEY="AIzaSyCK2NAphMT6UEQ4BuZMoh11tOTzgjMe-4E"
FIREBASE_AUTH_DOMAIN="kda-sommerprosjekt25.firebaseapp.com"
FIREBASE_PROJECT_ID="kda-sommerprosjekt25"
FIREBASE_STORAGE_BUCKET="kda-sommerprosjekt25.firebasestorage.app"
FIREBASE_MESSAGING_SENDER_ID="1079032437259"
FIREBASE_APP_ID="1:1079032437259:web:083085009111315fa6050e"

    Important: Remove any trailing commas or quotes if copying from other sources.

# 4. Add Firebase service account key

Download your Firebase service account JSON file from the Firebase Console and place it at the root of your project as:

serviceAccountKey.json

Make sure the path matches the import statement in src/firebase.ts.
# 5. Running the server

Start the Express server (which serves your React frontend and handles API requests) by running:

npm run start

The server will start on http://localhost:3000
# 6. Open the app

Open your browser and navigate to:

http://localhost:3000

You should see the React form allowing you to upload CSR files and submit them.
Project Structure Overview

/public
  index.html          # Frontend HTML & React code (loaded via CDN)
src/
  firebase.ts         # Firebase Admin SDK initialization
  server.ts           # Express backend server
serviceAccountKey.json # Firebase service account (private)
.env                  # Environment variables
package.json          # Project dependencies & scripts

## Notes

    The React frontend is served statically from the /public directory.

    The backend uses Firebase Admin SDK with Firestore to save certificate data.

    TypeScript is used on the backend for type safety.

    Make sure your Firebase service account has access to Firestore.

## Troubleshooting

    Error: Cannot find module 'ts-node'
    Run npm install to install all dependencies.

    Firebase permissions errors
    Verify your service account key is correct and Firestore rules allow writes.

    Environment variables not loading
    Ensure .env is at project root and contains correct values, no trailing commas.

