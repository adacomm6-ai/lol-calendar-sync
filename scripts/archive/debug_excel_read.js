const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'data', 'GLFS_c3e0a1_records.xlsx');

console.log('Checking file:', filePath);

if (!fs.existsSync(filePath)) {
    console.error('ERROR: File does not exist!');
    process.exit(1);
}

try {
    console.log('File exists. Attempting to read...');
    const wb = XLSX.readFile(filePath);
    console.log('Read success! Sheets:', wb.SheetNames);
} catch (e) {
    console.error('READ ERROR:', e);
}
