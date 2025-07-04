import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import fsExtra from 'fs-extra';
import unzipper from 'unzipper';
import archiver from 'archiver';
import { execFile, exec } from 'child_process';
import { Buffer } from 'buffer';
import { db } from './firebase';
import os from 'os';
import util from 'util';
import { promisify } from 'util';

const app = express();
const port = 3000;

// ----- CONFIG -----
const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const CA_CERT_PATH = '/CA/certs/rootCA1.cert.pem';      // Update as needed
const CERT_DIR = '/CA/newcerts';                        // Update as needed
const UPLOAD_DIR = '/CA/uploadsWebsite';                // Update as needed
const SIGN_SCRIPT = '/home/tsvuser/bashScripts/GPTscript.sh'; // Update as needed

const execAsync = util.promisify(exec);

// ----- MIDDLEWARE -----
app.use(express.json({ limit: '100mb' }));
app.use(express.static(PUBLIC_DIR));
app.use('/uploadsWebsite', express.static(UPLOAD_DIR));

// ----- ROUTES -----

// Serve homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'homepage.html'));
});

// Serve certificate download page
app.get('/downloadcerts/:id', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'downloadcerts.html'));
});

// Gir tilgang til bruk av CRL
app.use('/crl', express.static('/CA/crl'));

// Submit single CSR
app.post('/submit', async (req, res) => {
  const { certificateName, csr } = req.body;

  if (!certificateName || !csr) {
    return res.status(400).send('Missing certificate name or CSR content.');
  }

  try {
    const docRef = await db.collection('certificate_requests').add({
      certificateName,
      csr,
      timestamp: new Date()
    });

    const docId = docRef.id;

    // Wait for signing script before sending response
    await runSignScript(docId);

    res.json({ message: 'Certificate saved successfully', id: docId });

  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).send('Internal server error');
  }
});


// Handle zip upload of multiple CSRs
app.post('/submit-multiple-zip', async (req, res) => {
  try {
    const { zipBase64, namingConvention = 'autoID', baseName = 'cert' } = req.body;

    if (!zipBase64) return res.status(400).send('Missing zipBase64 in request body');

    const zipBuffer = Buffer.from(zipBase64, 'base64');
    const directory = await unzipper.Open.buffer(zipBuffer);

        // Filter CSR files only
        const csrFiles = directory.files.filter(f => f.path.toLowerCase().endsWith('.csr'));

        if (csrFiles.length === 0) {
          return res.status(400).send('No CSR files found in zip');
        }

        // Prepare array to hold individual cert zip buffers
        const individualZips: { name: string, buffer: Buffer }[] = [];

        // Process each CSR sequentially
        for (let i = 0; i < csrFiles.length; i++) {
          const file = csrFiles[i];

          // Read CSR content as text
          const csr = (await file.buffer()).toString('utf-8');
          if (!csr.includes('BEGIN CERTIFICATE REQUEST')) {
            console.warn(`Skipping invalid CSR file: ${file.path}`);
            continue;
          }

          // Determine certificateName based on namingConvention
          let certificateName: string;
          if (namingConvention === 'filename') {
            certificateName = path.basename(file.path, '.csr');
          } else if (namingConvention === 'predefined') {
            certificateName = `${baseName}_${i + 1}`;
          } else {
            certificateName = ""; // will use docId for name later
          }

          // Save CSR to Firestore
          const docRef = await db.collection('certificate_requests').add({
            certificateName,
            csr,
            timestamp: new Date()
          });
          const docId = docRef.id;
          const finalCertName = certificateName || docId;

          // Run signing script
          await new Promise<void>((resolve, reject) => {
            execFile('sudo', ['/bin/bash', SIGN_SCRIPT, docId], (error, stdout, stderr) => {
              if (error) return reject(error);
              if (stderr) console.error(`Signing stderr (${docId}):`, stderr);
              resolve();
            });
          });

          // Wait for signed certificate to appear
          const certPath = path.join(CERT_DIR, `${docId}.crt`);
          await waitForFile(certPath);

          // Read signed cert and CA cert from disk
          const certData = await fs.readFile(certPath);
          const caCertData = await fs.readFile(CA_CERT_PATH);

          // Create zip in memory for this certificate
          const archive = archiver('zip', { zlib: { level: 9 } });
          const zipChunks: Buffer[] = [];

          archive.on('data', chunk => zipChunks.push(chunk));
          const archivePromise = new Promise<void>((resolve, reject) => {
            archive.on('end', () => resolve());
            archive.on('error', reject);
            archive.on('finish', () => resolve());
          });

          archive.append(certData, { name: `${finalCertName}.crt` });
          archive.append(caCertData, { name: 'rootCA1.cert.pem' });

          archive.finalize();

          await archivePromise;

          const zippedBuffer = Buffer.concat(zipChunks);
          individualZips.push({ name: `${finalCertName}.zip`, buffer: zippedBuffer });
        }

        // Now create master zip bundling all individual zips
        const masterArchive = archiver('zip', { zlib: { level: 9 } });
        const masterChunks: Buffer[] = [];

        masterArchive.on('data', chunk => masterChunks.push(chunk));
        const masterPromise = new Promise<void>((resolve, reject) => {
          masterArchive.on('end', () => resolve());
          masterArchive.on('error', reject);
          masterArchive.on('finish', () => resolve());
        });

        for (const { name, buffer } of individualZips) {
          masterArchive.append(buffer, { name });
        }
        masterArchive.finalize();

        await masterPromise;

        const masterZipBuffer = Buffer.concat(masterChunks);

        // Send zip file as response with headers
        res.setHeader('Content-Disposition', 'attachment; filename=master.zip');
        res.setHeader('Content-Type', 'application/zip');
        res.send(masterZipBuffer);

      } catch (error) {
        console.error('Processing error:', error);
        res.status(500).send('Failed to process CSR files');
      }
    });



// Download CA root certificate
app.get('/download', async (req, res) => {
  try {
    await fs.access(CA_CERT_PATH);
  } catch {
    return res.status(404).send('CA certificate not found.');
  }

  res.setHeader('Content-Disposition', 'attachment; filename="rootCA1.cert.pem"');
  res.setHeader('Content-Type', 'application/x-x509-ca-cert');

  fsExtra.createReadStream(CA_CERT_PATH).pipe(res);
});

// Download individual signed certificate
app.get('/downloadcerts/:id/certificate', async (req, res) => {
  const docId = req.params.id;

  try {
    const doc = await db.collection('certificate_requests').doc(docId).get();
    if (!doc.exists) return res.status(404).send('Certificate not found.');

    const { certificateName } = doc.data() || {};
    const certPath = path.join(CERT_DIR, `${docId}.crt`);
    try {
      await fs.access(certPath);
    } catch {
      return res.status(404).send('Signed certificate missing.');
    }

    res.setHeader('Content-Disposition', `attachment; filename="${certificateName}.crt"`);
    res.setHeader('Content-Type', 'application/x-x509-user-cert');

    fsExtra.createReadStream(certPath).pipe(res);

  } catch (err) {
    console.error('Download error:', err);
    res.status(500).send('Internal server error');
  }
});

// Get metadata about certificate
app.get('/api/certmeta/:id', async (req, res) => {
  try {
    const doc = await db.collection('certificate_requests').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });

    res.json({ certificateName: doc.data()?.certificateName });
  } catch (err) {
    console.error('Metadata fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch metadata' });
  }
});

// ----- UTILITIES -----

function runSignScript(docId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('sudo', ['/bin/bash', SIGN_SCRIPT, docId], (error, stdout, stderr) => {
      if (error) return reject(error);
      if (stderr) console.error(`Script stderr: ${stderr}`);
      if (stdout) console.log(`Script output: ${stdout}`);
      resolve();
    });
  });
}

function waitForFile(filePath: string, timeout = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      fs.access(filePath)
        .then(() => resolve())
        .catch(() => {
          if (Date.now() - start > timeout) return reject(new Error('File not found in time'));
          setTimeout(check, 200);
        });
    };
    check();
  });
}

async function createIndividualZip(docId: string, certificateName: string): Promise<string> {
  const safeName = certificateName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const certFile = path.join(CERT_DIR, `${docId}.crt`);
  const zipFilePath = path.join(UPLOAD_DIR, 'tempzips', `${safeName}.zip`);

  await fsExtra.ensureDir(path.dirname(zipFilePath));

  return new Promise((resolve, reject) => {
    const output = fsExtra.createWriteStream(zipFilePath);
    const archive = archiver('zip');

    output.on('close', () => resolve(zipFilePath));
    archive.on('error', reject);

    archive.pipe(output);
    archive.file(certFile, { name: `${safeName}.crt` });
    archive.file(CA_CERT_PATH, { name: 'rootCA1.cert.pem' });
    archive.finalize();
  });
}

async function createMasterZip(outputPath: string, zipPaths: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fsExtra.createWriteStream(outputPath);
    const archive = archiver('zip');

    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);
    zipPaths.forEach(zipPath => {
      archive.file(zipPath, { name: path.basename(zipPath) });
    });
    archive.finalize();
  });
}

// ---- INSTILLINGER FOR KJØRING AV KODE ----
//NB: bare 1 app.listen av gangen

//Kjører koden på lokalnettet
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});

// // Kjører koden på localhost
// app.listen(port, () => {
//   console.log(`Server running at http://localhost:${port}`);
// });
