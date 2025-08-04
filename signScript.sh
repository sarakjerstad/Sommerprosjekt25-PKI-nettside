#!/bin/bash

# --- Configuration ---
PROJECT_ID="example"
COLLECTION="certificate_requests"
API_KEY="exampleapiKey"
BASE_URL="https://firestore.googleapis.com/v1/projects/$PROJECT_ID/databases/(default)/documents/$COLLECTION"

CA_CERT_PATH="/CA/certs/rootCA1.cert.pem"
CA_KEY_PATH="/CA/rootCA1.key.pem"
CSR_DIR="/home/tsvuser/bashScripts/csrTest"
CERT_OUTPUT_DIR="/CA/newcerts"
CA_CONF="/CA/openssl.cnf"

# --- Fetching documentID from website ---
DOC_ID="$1"

if [ -z "$DOC_ID" ]; then
  echo "Usage: $0 <document_id>"
  exit 1
fi

# --- Fetch CSR and certificateName ---
URL="$BASE_URL/$DOC_ID?key=$API_KEY"
echo "Fetching document with ID '$DOC_ID'..."
response=$(curl -s "$URL")

if ! command -v jq &> /dev/null; then
    echo "jq is required but not installed. Please install jq."
    exit 1
fi

CSR=$(echo "$response" | jq -r '.fields.csr.stringValue')
CERT_NAME=$(echo "$response" | jq -r '.fields.certificateName.stringValue')

if [ -z "$CSR" ] || [ "$CSR" = "null" ]; then
    echo "Error: CSR not found in document."
    exit 1
fi

# --- Save CSR ---
mkdir -p "$CSR_DIR" "$CERT_OUTPUT_DIR"
CSR_FILE="$CSR_DIR/${DOC_ID}.csr"
CRT_FILE="$CERT_OUTPUT_DIR/${DOC_ID}.crt"

echo -e "$CSR" > "$CSR_FILE"
echo "CSR saved to $CSR_FILE"

# --- Sign the CSR ---
echo "Signing the CSR..."

# Hardcoded CA key password (replace this with your actual password)
    # Dette er ikke best practise og burde nok gjøres smartere, men det funker for nå
CA_KEY_PASS="ca1passwd"

if [ -z "$CA_KEY_PASS" ]; then
    openssl ca -config "$CA_CONF" -in "$CSR_FILE" -out "$CRT_FILE" -days 90 -notext -batch -extensions usr_cert
else
    openssl ca -config "$CA_CONF" -in "$CSR_FILE" -out "$CRT_FILE" -days 90 -notext -batch -passin pass:"$CA_KEY_PASS" -extensions usr_cert
fi

if [ $? -eq 0 ]; then
    echo "Certificate signed successfully and saved to $CRT_FILE"
else
    echo "Error signing certificate."
fi
