import express from 'express';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { db } from './firebase';

const app = express();
const port = 3000;

// ---- KONFIGURERING ----
const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const CA_CERT_PATH = path.join('/CA/certs', 'rootCA1.cert.pem'); // ENDRE FOR EGET SYSTEM!!! (Stien til CA-sertifikatet)
const CERT_DIR = '/CA/newcerts'; // ENDRE FOR EGET SYSTEM!!! (Stien til hvor signerte sertifikater lagres)
const SIGN_SCRIPT = '/home/tsvuser/bashScripts/GPTscript.sh'; // ENDRE FOR EGET SYSTEM!!! (Stien til hvor scriptet for signering av sertifikater er lagt)

// ---- MIDDLEWARE ----
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// ---- RUTER ----

// Sti for hovedsiden
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'homepage.html'));
});

//Sti for nedlastingssiden
app.get('/downloadcerts/:id', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'downloadcerts.html'));
});

// Opplasting av sertifikater
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
    res.json({ message: 'Certificate saved successfully', id: docId });

    // Kjører bash script for signering
    execFile('sudo', ['/bin/bash', SIGN_SCRIPT, docId], (error, stdout, stderr) => {
      if (error) return console.error(`Script error: ${error.message}`);
      if (stderr) console.error(`Script stderr: ${stderr}`);
      if (stdout) console.log(`Script output: ${stdout}`);
    });

  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).send('Internal server error');
  }
});

// Laste ned CA sertifikat
app.get('/download', (req, res) => {
  if (!fs.existsSync(CA_CERT_PATH)) {
    return res.status(404).send('CA certificate not found.');
  }

  res.setHeader('Content-Disposition', 'attachment; filename="rootCA1.crt"');
  res.setHeader('Content-Type', 'application/x-x509-ca-cert');

  fs.createReadStream(CA_CERT_PATH).pipe(res);
});

// Laste ned signert sertifikat
app.get('/downloadcerts/:id/certificate', async (req, res) => {
  const docId = req.params.id;

  try {
    const doc = await db.collection('certificate_requests').doc(docId).get();
    if (!doc.exists) return res.status(404).send('Certificate request not found.');

    const data = doc.data();
    const certificateName = data?.certificateName;
    if (!certificateName) return res.status(400).send('Missing certificate name.');

    const certPath = path.join(CERT_DIR, `${docId}.crt`);
    if (!fs.existsSync(certPath)) return res.status(404).send('Signed certificate not found.');

    // NB: her sjekkes det ikke for om alle karakterene er gyldig i filnavnet. Kan være noe å se på!
    res.setHeader('Content-Disposition', `attachment; filename="${certificateName}.crt"`);
    res.setHeader('Content-Type', 'application/x-x509-user-cert');

    fs.createReadStream(certPath).pipe(res);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).send('Internal server error');
  }
});

// Henter sertifikat metadata
app.get('/api/certmeta/:id', async (req, res) => {
  const docId = req.params.id;

  try {
    const doc = await db.collection('certificate_requests').doc(docId).get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });

    const { certificateName } = doc.data() || {};
    res.json({ certificateName });
  } catch (err) {
    console.error('Metadata fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch metadata' });
  }
});

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