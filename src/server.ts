import express from 'express';
import path from 'path';
import fs from 'fs';
import fsExtra from 'fs-extra';
import unzipper from 'unzipper';
import archiver from 'archiver';
import { execFile } from 'child_process';
import { Buffer } from 'buffer';
import { db } from './firebase';

const app = express();
const port = 3000;

// ----- CONFIG -----
const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const CA_CERT_PATH = '/CA/certs/rootCA1.cert.pem';      // Update as needed
const CERT_DIR = '/CA/newcerts';                        // Update as needed
const UPLOAD_DIR = '/CA/uploadsWebsite';                // Update as needed
const SIGN_SCRIPT = '/home/tsvuser/bashScripts/GPTscript.sh'; // Update as needed
const ZIP_DIR = path.join(ROOT_DIR, 'zips');

fsExtra.ensureDirSync(ZIP_DIR);

// ----- MIDDLEWARE -----
app.use(express.json({ limit: '50mb' }));
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

// Submit single CSR
app.post('/submit', async (req, res) => {
  const { certificateName, csr } = req.body;
  if (!certificateName || !csr) return res.status(400).send('Missing certificate name or CSR.');

  try {
    const docRef = await db.collection('certificate_requests').add({
      certificateName,
      csr,
      timestamp: new Date(),
    });

    const docId = docRef.id;

    await runSignScript(docId);
    res.json({ message: 'Certificate saved and signed successfully', id: docId });
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).send('Internal server error');
  }
});

// Handle zip upload of multiple CSRs
app.post('/submit-multiple-zip', async (req, res) => {
  const { zipFileName, zipBase64 } = req.body;
  if (!zipFileName || !zipBase64) return res.status(400).send('Missing zip file or name.');

  const buffer = Buffer.from(zipBase64, 'base64');
  const tempZipPath = path.join(UPLOAD_DIR, `temp_${Date.now()}_${zipFileName}`);
  const extractDir = path.join(UPLOAD_DIR, `extracted_${Date.now()}`);
  await fsExtra.ensureDir(extractDir);

  try {
    await fs.promises.writeFile(tempZipPath, buffer);

    // Extract zip
    await fs.createReadStream(tempZipPath)
      .pipe(unzipper.Extract({ path: extractDir }))
      .promise();

    const csrFiles: string[] = [];
    function walkDir(dir: string) {
      for (const file of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) walkDir(fullPath);
        else if (file.endsWith('.csr')) csrFiles.push(fullPath);
      }
    }
    walkDir(extractDir);

    if (csrFiles.length === 0) return res.status(400).send('No .csr files found.');

    const signedCerts: { id: string; certificateName: string; zipPath: string }[] = [];

    for (const csrFilePath of csrFiles) {
      const csrContent = await fs.promises.readFile(csrFilePath, 'utf-8');
      const certificateName = path.parse(csrFilePath).name;

      const docRef = await db.collection('certificate_requests').add({
        certificateName,
        csr: csrContent,
        timestamp: new Date(),
      });
      const docId = docRef.id;

      await runSignScript(docId);

      const certPath = path.join(CERT_DIR, `${docId}.crt`);
      await waitForFile(certPath);

      const zipPath = await createIndividualZip(docId, certificateName);
      signedCerts.push({ id: docId, certificateName, zipPath });
    }

    const masterZipName = `all_certificates_${Date.now()}.zip`;
    const masterZipPath = path.join(ZIP_DIR, masterZipName);

    await createMasterZip(masterZipPath, signedCerts.map(s => s.zipPath));

    // Clean up
    await fsExtra.remove(tempZipPath);
    await fsExtra.remove(extractDir);
    for (const { zipPath } of signedCerts) await fsExtra.remove(zipPath);

    res.json({
      message: `Signed ${signedCerts.length} certificates.`,
      certificates: signedCerts.map(({ id, certificateName }) => ({ id, certificateName })),
      masterZipUrl: `/download-master/${masterZipName}`,
    });

  } catch (err) {
    console.error('submit-multiple-zip error:', err);
    res.status(500).send('Failed to process uploaded zip.');
  }
});

// Download CA root certificate
app.get('/download', (req, res) => {
  if (!fs.existsSync(CA_CERT_PATH)) return res.status(404).send('CA certificate not found.');

  res.setHeader('Content-Disposition', 'attachment; filename="rootCA1.cert.pem"');
  res.setHeader('Content-Type', 'application/x-x509-ca-cert');

  fs.createReadStream(CA_CERT_PATH).pipe(res);
});

// Download individual signed certificate
app.get('/downloadcerts/:id/certificate', async (req, res) => {
  const docId = req.params.id;

  try {
    const doc = await db.collection('certificate_requests').doc(docId).get();
    if (!doc.exists) return res.status(404).send('Certificate not found.');

    const { certificateName } = doc.data() || {};
    const certPath = path.join(CERT_DIR, `${docId}.crt`);
    if (!fs.existsSync(certPath)) return res.status(404).send('Signed certificate missing.');

    res.setHeader('Content-Disposition', `attachment; filename="${certificateName}.crt"`);
    res.setHeader('Content-Type', 'application/x-x509-user-cert');
    fs.createReadStream(certPath).pipe(res);

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

// Download master zip file
app.get('/download-master/:zipName', (req, res) => {
  const zipPath = path.join(ZIP_DIR, req.params.zipName);
  if (fs.existsSync(zipPath)) res.download(zipPath);
  else res.status(404).send('Master zip not found.');
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
      if (fs.existsSync(filePath)) return resolve();
      if (Date.now() - start > timeout) return reject(new Error('File not found in time'));
      setTimeout(check, 200);
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
    const output = fs.createWriteStream(zipFilePath);
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
    const output = fs.createWriteStream(outputPath);
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