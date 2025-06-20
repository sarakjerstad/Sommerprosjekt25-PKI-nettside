import express from 'express';
import path from 'path';
import { db } from './firebase'; // Import Firestore instance
import fs from 'fs';

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/certs', express.static(path.join(__dirname, '..', 'CAcert')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Route to serve the download page
app.get('/downloadcerts', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'downloadcerts.html'));
});


app.post('/submit', async (req, res) => {
  const { certificateName, csr } = req.body;

  if (!certificateName || !csr) {
    return res.status(400).send('Missing certificate name or CSR content');
  }

  try {
    await db.collection('certificate_requests').doc(certificateName).set({
      csr,
      timestamp: new Date() // or admin.firestore.FieldValue.serverTimestamp() if you import admin here
    });
    res.send('Certificate saved successfully!');
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal server error');
  }
});

const certPath = path.join(__dirname, '..', 'CAcert', 'rootCA1.crt');

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
