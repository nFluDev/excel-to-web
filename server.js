// ... (Diğer require ve değişkenler aynı kalacak) ...
const express = require('express');
const multer = require('multer');
const path = require('path');
const XLSX = require('xlsx');
const fs = require('fs');

const app = express();
const port = 3000;

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

app.use(express.static('public'));
app.use(express.json());

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }
});

const findHeaderRow = (worksheet) => {
    let maxFilledCells = 0;
    let headerRowIndex = -1;
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    
    for (let R = range.s.r; R <= range.e.r; ++R) {
        let filledCells = 0;
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = worksheet[cellAddress];
            if (cell && cell.v) {
                filledCells++;
            }
        }
        if (filledCells > maxFilledCells) {
            maxFilledCells = filledCells;
            headerRowIndex = R;
        }
    }
    return headerRowIndex;
};

const convertExcelToJson = (worksheet, headerRowIndex) => {
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    range.s.r = headerRowIndex;
    const newRange = XLSX.utils.encode_range(range);
    
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: newRange });
    
    const headers = rawData[0];
    const dataRows = rawData.slice(1);
    
    return dataRows.map(row => {
        const obj = {};
        headers.forEach((header, index) => {
            obj[header.trim().replace(/[\r\n]/g, ' ')] = row[index] || '';
        });
        return obj;
    });
};

app.post('/upload', upload.single('excelFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('Lütfen bir dosya seçin.');
    }
    
    const { category } = req.body;
    if (!category) {
        return res.status(400).send('Lütfen geçerli bir kategori seçin.');
    }
    
    const dataFilePath = path.join(uploadsDir, `${category}.json`);

    try {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const headerRowIndex = findHeaderRow(worksheet);

        if (headerRowIndex === -1) {
            return res.status(400).send('Hata: Excel dosyasında geçerli bir başlık satırı bulunamadı.');
        }
        
        const newJsonData = convertExcelToJson(worksheet, headerRowIndex);
        
        let existingData = [];
        if (fs.existsSync(dataFilePath)) {
            const fileContent = fs.readFileSync(dataFilePath, 'utf8');
            existingData = JSON.parse(fileContent);
        }
        
        const combinedData = [...existingData, ...newJsonData];
        
        const seen = new Set();
        const uniqueData = combinedData.filter(row => {
            const serializedRow = JSON.stringify(row);
            if (seen.has(serializedRow)) {
                return false;
            } else {
                seen.add(serializedRow);
                return true;
            }
        });

        fs.writeFileSync(dataFilePath, JSON.stringify(uniqueData, null, 2));
        
        res.status(200).json({ 
            message: `Veriler başarıyla ${category}.json dosyasına eklendi.`,
            data: uniqueData
        });
        
    } catch (e) {
        console.error('Dönüştürme işlemi sırasında hata oluştu:', e.message);
        res.status(500).send('Dosya işlenirken bir hata oluştu.');
    }
});

let validCategories = [];
app.post('/api/update-categories', (req, res) => {
    const { categories } = req.body;
    validCategories = categories;
    res.status(200).json({ message: 'Kategoriler başarıyla güncellendi.' });
});

app.get('/api/get-headers/:category', (req, res) => {
    const { category } = req.params;
    const dataFilePath = path.join(uploadsDir, `${category}.json`);
    let headers = [];
    let message = '';

    if (fs.existsSync(dataFilePath)) {
        try {
            const fileContent = fs.readFileSync(dataFilePath, 'utf8');
            const data = JSON.parse(fileContent);
            if (data.length > 0) {
                headers = Object.keys(data[0]);
                message = `"${category}" kategorisindeki mevcut başlıklar kullanıldı.`;
            } else {
                message = `"${category}" kategorisinde veri bulunamadı. Lütfen formu doldurarak ilk veriyi girin.`;
            }
        } catch (e) {
            console.error('Başlıkları okuma hatası:', e);
            message = 'Veri dosyası okuma hatası.';
        }
    } else {
        message = `"${category}" kategorisi için dosya bulunamadı. Lütfen formu doldurarak ilk veriyi girin.`;
    }

    res.json({ headers, message });
});

app.post('/api/add-data', (req, res) => {
    const { category, formData } = req.body;
    if (!category || !formData) {
        return res.status(400).send('Kategori veya form verisi eksik.');
    }

    const dataFilePath = path.join(uploadsDir, `${category}.json`);

    try {
        let existingData = [];
        if (fs.existsSync(dataFilePath)) {
            const fileContent = fs.readFileSync(dataFilePath, 'utf8');
            existingData = JSON.parse(fileContent);
        }

        const newData = [formData, ...existingData];
        
        const seen = new Set();
        const uniqueData = newData.filter(row => {
            const serializedRow = JSON.stringify(row);
            if (seen.has(serializedRow)) {
                return false;
            } else {
                seen.add(serializedRow);
                return true;
            }
        });

        fs.writeFileSync(dataFilePath, JSON.stringify(uniqueData, null, 2));

        res.status(200).json({
            message: `Veri başarıyla ${category}.json dosyasına eklendi.`,
            data: uniqueData
        });
    } catch (e) {
        console.error('Veri ekleme sırasında hata oluştu:', e.message);
        res.status(500).send('Veri eklenirken bir hata oluştu.');
    }
});

app.get('/api/get-data/:category', (req, res) => {
    const { category } = req.params;
    const dataFilePath = path.join(uploadsDir, `${category}.json`);

    if (fs.existsSync(dataFilePath)) {
        try {
            const fileContent = fs.readFileSync(dataFilePath, 'utf8');
            const data = JSON.parse(fileContent);
            res.json(data);
        } catch (e) {
            res.status(500).send('Veri dosyası okuma hatası.');
        }
    } else {
        res.json([]);
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/:category', (req, res, next) => {
    const { category } = req.params;

    if (validCategories.includes(category)) {
        res.sendFile(path.join(__dirname, 'public', 'data.html'));
    } else {
        next();
    }
});

app.use((req, res, next) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

const server = app.listen(port, () => {
  console.log(`Sunucu http://localhost:${port} adresinde çalışıyor`);
});

server.timeout = 300000;