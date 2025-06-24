import express from 'express';
import path from 'path';
import { db } from './firebase'; // Import Firestore instance
import fs from 'fs';
import { execFile } from 'child_process'; // Add this at the top

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
//Lager statisk sti for CAcert direkotratet
app.use('/certs', express.static(path.join(__dirname, '..', 'CAcert')));

// Ruter bruker til hovedside via URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Ruter bruiker til nedlastingsside via URL
app.get('/downloadcerts', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'downloadcerts.html'));
});

app.get('/downloadcerts/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'downloadcerts.html'));
});

app.get('/downloadcerts/:id/certificate', async (req, res) => {
  const docId = req.params.id;

  try {
    const doc = await db.collection('certificate_requests').doc(docId).get();

    if (!doc.exists) {
      return res.status(404).send('Document not found');
    }

    const data = doc.data();
    const certificateName = data?.certificateName;

    if (!certificateName) {
      return res.status(400).send('Certificate name missing from document');
    }

    const crtPath = path.join('/CA/newcerts', `${docId}.crt`);
    if (!fs.existsSync(crtPath)) {
      return res.status(404).send('Certificate not found on server');
    }

    // 🛡️ Sanitize filename to avoid invalid characters
    const safeCertName = certificateName.replace(/[^a-zA-Z0-9_-]/g, '_');

    // ✅ Set proper headers to force download with correct filename
    res.setHeader('Content-Disposition', `attachment; filename="${safeCertName}.crt"`);
    res.setHeader('Content-Type', 'application/x-x509-user-cert');

    // ✅ Stream the file
    const fileStream = fs.createReadStream(crtPath);
    fileStream.pipe(res);
  } catch (err) {
    console.error('Error downloading certificate:', err);
    res.status(500).send('Internal server error');
  }
});

app.get('/api/certmeta/:id', async (req, res) => {
  const docId = req.params.id;
  try {
    const doc = await db.collection('certificate_requests').doc(docId).get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    const data = doc.data();
    res.json({ certificateName: data?.certificateName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch certificate metadata' });
  }
});

app.get('/download', (req, res) => {
  if (!fs.existsSync(certPath)) {
    return res.status(404).send('Certificate file not found');
  }

  res.setHeader('Content-Disposition', 'attachment; filename="rootCA1.crt"');
  res.setHeader('Content-Type', 'application/x-x509-ca-cert');

  const fileStream = fs.createReadStream(certPath);
  fileStream.pipe(res);
});

// Behandler opplastninger til firebase
app.post('/submit', async (req, res) => {
  const { certificateName, csr } = req.body;

  if (!certificateName || !csr) {
    return res.status(400).send('Missing certificate name or CSR content');
  }

  try {
    // Add document and get reference
    const docRef = await db.collection('certificate_requests').add({
      certificateName,
      csr,
      timestamp: new Date()
    });

    const docId = docRef.id;
    res.json({ message: 'Certificate saved successfully', id: docId });

    // Run your bash script, pass docId as argument
  execFile('sudo', ['/bin/bash', '/home/tsvuser/bashScripts/GPTscript.sh', docId], (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing bash script: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`Script stderr: ${stderr}`);
      }
      console.log(`Script output: ${stdout}`);
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Internal server error');
  }
});

// Lager statisk sti til CAcerten
// const certPath = path.join(__dirname, '..', 'CAcert', 'rootCA1.crt');
const certPath = path.join('/CA/certs', 'rootCA1.cert.pem');


app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});

// app.listen(port, () => {
//   console.log(`Server running at http://localhost:${port}`);
// });