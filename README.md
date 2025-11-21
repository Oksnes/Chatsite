# DOKUMENTASJON




## Database
Jeg har laget en database med 3 tabeller

Jeg har tenk til å ha en chat side der folk har profil bilder, Kan sende meldinger med og uten bilder og kan snakke i flere forskjellige kanaler, denne databasen lar meg gjøre dette.

| User | Datatype |
|-------|--------|
|UserID|INTEGER|
|Username|TEXT|
|Password|TEXT|
|ProfilePicture|TEXT|
|Admin|INT|  

|Messages|Datatype|
|--------|--------|
|messageID|INTEGER|
|Content|TEXT|
|UserID|INTEGER|
|ImagePath|TEXT|
|ChannelID|INTEGER|
|Time|TEXT|

|Channel|Datatype|
|-------|-------|
|ChannelID|INTEGER|
|ChannelName|TEXT|




## Multer

Multer er en node package som lar serveren lagre et bilde lokalt <br>
Jeg bruker Multer i min app for å lagre brukere sine bilder som de sender i chatten og som de setter som profilbilde.

Her så sier jeg at bildene skal være satt i buffer før de blir lastet opp i disken for at de ikke skal bli lagret på serveren før de er sjekket for filstørrelse.
```js
const storage = multer.memoryStorage();
```

Her så setter man instillinger for hva som er låv til å uploades, en maks filstørrelse på 5mb og at det bare skal være bilder
```js
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg'];
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
    }
});
```


Her så definerer man hvor filene skal bli sendt.
```js
const uploadDir = path.join(__dirname, 'public/Images');
// Create uploads directory if it doesn't exist
const fs = require('fs');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
```

Her så setter man lageret til den upload directory-et og setter filnavn
I tillegg så bruker jeg Sharp (en annen node package) for å komprimere bildene.
```js
async function saveImageBuffer(buffer, originalname, opts = {}) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = `Multer-Image-${uniqueSuffix}.webp`;
    const outPath = path.join(uploadDir, filename);

    // Default resize width and quality, can be overridden via opts
    const width = opts.width || 375;
    const quality = typeof opts.quality === 'number' ? opts.quality : 50;

    await sharp(buffer)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality })
      .toFile(outPath);

    return filename;
}
```




Her så lastes et bilde til lageret.

Det blir gjort med å sette bilde i en formData og så med upload.single( ' [Navnet i formData-en] ' ) som en del av app.posten i app.js filen

etter det så bruker jeg den forige funksjonen til å få filstien for å sette det inn i databasen.
```js

//chat.js
  const formData = new FormData();
  if (Content) formData.append('Content', Content);
  if (imageFile) formData.append('Image', imageFile);


//app.js

app.post('/Channel/:ChannelID/Messages', upload.single('Image'), (req, res) => {

    //code.....

    let ImagePath = null;
    if (req.file) {
        // Compress + save the uploaded image as WebP
        const savedFilename = await saveImageBuffer(req.file.buffer, req.file.originalname, { width: 750, quality: 80 });
        ImagePath = `/Images/${savedFilename}`;
    }

    const stmt = db.prepare('INSERT INTO Messages (UserID, ChannelID, Content, ImagePath, Time) VALUES (?, ?, ?, ?, ?)');
    stmt.run(UserID, ChannelID, Content || null, ImagePath, Time);

    res.sendStatus(200);
});
```