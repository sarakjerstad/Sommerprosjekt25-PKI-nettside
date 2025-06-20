import express from 'express';
import path from 'path';
import { db } from './firebase'; // Import Firestore instance

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
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

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
