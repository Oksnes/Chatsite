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
```js
// Configure multer with disk storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        // Create unique filename with original extension
        const ext = path.extname(file.originalname);
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'Multer-Image-' + uniqueSuffix + ext);
    }
});
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

Her så lastes et bilde til lageret.

Det blir gjort med å sette bilde i en formData og så med upload.single( ' [Navnet i formData-en] ' ) som en del av app.posten i app.js filen

etter det så bruker jeg path packag-en til å få filstien for å sette den inn i databasen
```js

//chat.js
  const formData = new FormData();
  if (Content) formData.append('Content', Content);
  if (imageFile) formData.append('Image', imageFile);


//app.js

app.post('/Channel/:ChannelID/Messages', upload.single('Image'), (req, res) => {

    //code.....

    const ImagePath = req.file ? `/Images/${req.file.filename}` : null;

    const stmt = db.prepare('INSERT INTO Messages (UserID, ChannelID, Content, ImagePath, Time) VALUES (?, ?, ?, ?, ?)');
    stmt.run(UserID, ChannelID, Content || null, ImagePath, Time);

    res.sendStatus(200);
});
```