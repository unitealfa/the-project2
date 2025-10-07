import dotenv from 'dotenv';
import app from './app';

dotenv.config();

// 🧩 Route pour envoyer une mise à jour vers Google Sheets
app.post('/update-sheet', async (req, res) => {
    try {
        const sheetSyncUrl = process.env.GOOGLE_SHEET_SYNC_URL;

        if (!sheetSyncUrl) {
            return res
                .status(500)
                .json({ success: false, message: 'GOOGLE_SHEET_SYNC_URL is not configured.' });
        }

        const response = await fetch(sheetSyncUrl, {
            method: 'POST',
            redirect: 'follow', // ✅ <- ajoute cette ligne !
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(req.body as Record<string, string>),
        });

        const text = await response.text();
        res.status(200).send(text);
    } catch (error) {
        console.error('Erreur Google Sheet:', error);
        res.status(500).json({ success: false, message: (error as Error).message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});