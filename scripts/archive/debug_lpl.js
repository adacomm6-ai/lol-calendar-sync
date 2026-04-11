const https = require('https');
const fs = require('fs');

const url = "https://img.crawler.qq.com/lolwebvideo/20240920155612/8df4b2b15f3e97f047ac978711134748/0"; // WBG Logo
const dest = "test_wbg.png";

const options = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://lpl.qq.com/'
    }
};

console.log("Downloading " + url);
const req = https.get(url, options, (res) => {
    console.log("Status:", res.statusCode);
    console.log("Headers:", res.headers);

    if (res.statusCode === 200) {
        res.pipe(fs.createWriteStream(dest))
            .on('finish', () => console.log("Saved to " + dest));
    } else {
        res.resume(); // Consume
    }
}).on('error', e => console.error(e));
