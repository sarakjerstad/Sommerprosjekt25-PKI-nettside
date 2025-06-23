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
const certPath = path.join(__dirname, '..', 'CAcert', 'rootCA1.crt');


// Behandler nedlastning av CAcert (så langt)
app.get('/download', (req, res) => {
  if (!fs.existsSync(certPath)) {
    return res.status(404).send('Certificate file not found');
  }

  res.setHeader('Content-Disposition', 'attachment; filename="rootCA1.crt"');
  res.setHeader('Content-Type', 'application/x-x509-ca-cert');

  const fileStream = fs.createReadStream(certPath);
  fileStream.pipe(res);
});


app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
