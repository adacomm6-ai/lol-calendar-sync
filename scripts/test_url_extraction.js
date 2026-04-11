const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
let dbUrl = '';
let directUrl = '';

if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of envLines) {
        if (line.match(/^#?\s*DATABASE_URL=.*supabase/i)) {
            dbUrl = line.substring(line.indexOf('=') + 1).replace(/"/g, '').trim();
        }
        if (line.match(/^#?\s*DIRECT_URL=.*supabase/i)) {
            directUrl = line.substring(line.indexOf('=') + 1).replace(/"/g, '').trim();
        }
    }
}
console.log('dbUrl length:', dbUrl ? dbUrl.length : 0);
console.log('directUrl length:', directUrl ? directUrl.length : 0);
console.log('has params db:', dbUrl.includes('?'));
console.log('success:', !!dbUrl && !!directUrl && dbUrl.includes('supabase'));
