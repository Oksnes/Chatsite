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

Her så setter man lageret til den upload directory-et og setter filnavn.
Jeg bruker Sharp (en annen node package) for å komprimere bildene, i tilleg så bruker jeg Gifsicle (enda en node package) for å komprimere gifs. En god del av denne kodeblokken er laget av AI, men jeg tok det bare med siden det skal kjøre på en server og jeg ville ikke fylle lageret helt opp med bilder.
```js
const execFileAsync = util.promisify(execFile);
async function saveImageBuffer(buffer, originalname, opts = {}) {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  const ext = path.extname(originalname || '').toLowerCase();

  // Default resize width and quality, can be overridden via opts
  const width = opts.width || 375;
  const quality = typeof opts.quality === 'number' ? opts.quality : 50;


// If original is GIF, try to optimize it using gifsicle (preserve animation)
  if (ext === '.gif') {
    const filename = `Multer-Image-${uniqueSuffix}.gif`;
    const outPath = path.join(uploadDir, filename);
    try {
      const gifsiclePath = require('gifsicle');
      const os = require('os');
      const tmpdir = os.tmpdir();
      const inTmp = path.join(tmpdir, `in-${uniqueSuffix}.gif`);
      const optTmp = path.join(tmpdir, `opt-${uniqueSuffix}.gif`);
      const lossyTmp = path.join(tmpdir, `lossy-${uniqueSuffix}.gif`);
      // write input to temp file
      fs.writeFileSync(inTmp, buffer);

      // 1) Lossless optimize
      try {
        await execFileAsync(gifsiclePath, ['--optimize=3', '--output', optTmp, inTmp]);
      } catch (e) {
        // non-fatal, continue to try other options
      }

      // 2) Try a lossy pass (only if it helps later)
      try {
        // adjust --lossy value if you want stronger/weaker compression
        await execFileAsync(gifsiclePath, ['--lossy=80', '--output', lossyTmp, inTmp]);
      } catch (e) {
        // ignore
      }

      const statSafe = (p) => {
        try { return fs.existsSync(p) ? fs.statSync(p).size : Infinity; }
        catch { return Infinity; }
      };

      const inSize = statSafe(inTmp);
      const optSize = statSafe(optTmp);
      const lossySize = statSafe(lossyTmp);

      // pick the smallest valid file (prefer optimized over lossy if equal)
      let chosenTmp = inTmp;
      let chosenSize = inSize;
      if (optSize < chosenSize) { chosenTmp = optTmp; chosenSize = optSize; }
      if (lossySize < chosenSize) { chosenTmp = lossyTmp; chosenSize = lossySize; }

      // If the chosen is the original (inTmp), just save original buffer; otherwise copy chosen tmp to outPath
      if (chosenTmp === inTmp) {
        fs.writeFileSync(outPath, buffer);
      } else {
        fs.copyFileSync(chosenTmp, outPath);
      }

      // cleanup temp files
      [inTmp, optTmp, lossyTmp].forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {} });

      return filename;
    } catch (err) {
      console.error('GIF optimization failed, saving original GIF:', err);
      const filename = `Multer-Image-${uniqueSuffix}.gif`;
      const outPath = path.join(uploadDir, filename);
      fs.writeFileSync(outPath, buffer);
      return filename;
    }
  }

  // Determine output format based on original extension/mimetype.
  // Keep jpeg/jpg, png and webp when possible; otherwise convert to webp.
  let format = 'webp';
  if (ext === '.jpg' || ext === '.jpeg') format = 'jpeg';
  else if (ext === '.png') format = 'png';
  else if (ext === '.webp') format = 'webp';

  const outExt = format === 'jpeg' ? 'jpg' : format;
  const filename = `Multer-Image-${uniqueSuffix}.${outExt}`;
  const outPath = path.join(uploadDir, filename);

  // Build transformer with resize and format-specific options
  let transformer = sharp(buffer).resize({ width, withoutEnlargement: true });
  if (format === 'jpeg') {
      transformer = transformer.jpeg({ quality });
  } else if (format === 'png') {
      // PNG doesn't use 'quality' the same way; use compressionLevel (0-9) derived from quality.
      const compressionLevel = Math.max(0, Math.min(9, Math.round((100 - quality) / 11)));
      transformer = transformer.png({ compressionLevel });
  } else if(format ==='webp'){ // webp
      transformer = transformer.webp({ quality });
  } else {
      transformer = transformer.gif({quality }); // Fallback, though GIFs are handled above
  }

  await transformer.toFile(outPath);

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

## Express

Her så setter jeg instillinger for Express og Express session. Jeg setter public mappen i første linje og i andre linje får jeg express til å håndtere JSON.

Under der så setter jeg Session og jeg bruker det for å passe på at noen sider bare kan bli vist hvis man er logget inn, det gjør jeg i requireLogin og requireAdmin funksjonene.

Jeg har en mappe som jeg vil at folk skal ha tilgang til men bare når de følger requireAdmin funksjonen (app.use på bunnen)
```js
// Middleware for å parse JSON og URL-encoded data
app.use(express.static("public"));
app.use(express.json());

// Middleware for å håndtere sessions
app.use(session({
  secret: 'supersecretkey', // Endre denne til en sterk hemmelighet i produksjon
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Sett til true hvis du bruker HTTPS
}));

function requireLogin(req, res, next) {
  if (!req.session.User) { //Se om bruker er logget inn
      return res.redirect("/login.html"); //send til login siden hvis du ikke er logget inn
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.User || Number(req.session.User.Admin) !== 1) {
      return res.status(403).send("Access denied. Admins only.");
  }
  next();
}

app.use('/secure', requireAdmin, express.static(path.join(__dirname, 'secure')));

```

For å gi en bruker en session så har jeg denne linjen med kode i /login ruten
```js
  // Lagre brukerdata i session
  req.session.User = { id: User.UserID, Username: User.Username, Admin: Number(User.Admin || 0) }; //gir sessionene din disse dataene
```

## Registrering av bruker

Her er ruten for å registrere en bruker, I første linje der det står upload.single så definerer jeg hvor den skal hente profilbilde fra.

Her så henter jeg Brukernavnet og passordet, sjekker om den faktisk har fått begge to og sjekker om en bruker med samme brukernavn allerede finnes i databasen. Jeg sjekker også om brukeren uploaded et profilbilde. Under der så henter jeg ut filstien som bilde ble sendt til for å putte det i databasen. 

Jeg bruker bcrypt for å kryptere passord, så sender jeg Brukernavnet, krypterte passordet og stien til profilbilde inn i databasen (Bruker id er på autoincrement.)
```js
app.post("/registerUser", (req, res) => {
    upload.single('ProfilePicture')(req, res, async (err) => {
        try {
            if (err instanceof multer.MulterError) {
                // A Multer error occurred (e.g., file too large)
                return res.status(400).json({ error: true, message: err.message });
            } else if (err) {
                // An unknown error occurred
                return res.status(400).json({ error: true, message: err.message });
            }

            const { Username, Password } = req.body;

            // Validate username and password
            if (!Username || !Password) {
                return res.status(400).json({ error: true, message: 'Username and password are required' });
            }

            // Check if username already exists
            const existingUser = db.prepare('SELECT Username FROM User WHERE Username = ?').get(Username);
            if (existingUser) {
                return res.status(400).json({ error: true, message: 'Username already exists' });
            }

            if (!req.file) {
                return res.status(400).json({ error: true, message: 'Profile picture is required' });
            }

            const savedFilename = await saveImageBuffer(req.file.buffer, req.file.originalname, { width: 400, quality: 80 });
            const ProfilePicture = `/Images/${savedFilename}`;
            const saltRounds = 10;
            const hashPassword = await bcrypt.hash(Password, saltRounds);

            const stmt = db.prepare("INSERT INTO User (Username, Password, ProfilePicture) VALUES (?, ?, ?)");
            const info = stmt.run(Username, hashPassword, ProfilePicture);

            res.json({ 
                success: true, 
                message: "User created successfully",
                user: { 
                    id: info.lastInsertRowid,
                    username: Username,
                    profilePicture: ProfilePicture
                }
            });
        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({ error: true, message: 'Internal server error' });
        }
    });
});
```

Her er kode for å oppdatere en bruker, koden er ganske lik bare med noen endringer som gjør at man ikke må sende inn noe nytt og at den vil bruke det som allere var der

```js
app.put('/updateUser', upload.single('ProfilePicture'), requireLogin, async (req, res) => {
  const UserID = req.session.User?.id;
  if (!UserID) {
      return res.status(401).json({ message: "Not logged in" });
  }

  try {
      const { Username, Password } = req.body;

      // Fetch existing user to preserve values when not provided
      const existing = db.prepare('SELECT Username, Password, ProfilePicture FROM User WHERE UserID = ?').get(UserID);
      if (!existing) {
          return res.status(404).json({ message: "User not found" });
      }

      const newUsername = (typeof Username === 'string' && Username.trim().length) ? Username.trim() : existing.Username;

      // Handle profile picture (optional)
      let newProfilePicture = existing.ProfilePicture;
      if (req.file) {
          const savedFilename = await saveImageBuffer(req.file.buffer, req.file.originalname, { width: 400, quality: 80 });
          newProfilePicture = `/Images/${savedFilename}`;
      }

      // Handle password (optional)
      let newPasswordHash = existing.Password;
      if (typeof Password === 'string' && Password.length) {
          const saltRounds = 10;
          newPasswordHash = await bcrypt.hash(Password, saltRounds);
      }

      const result = db.prepare('UPDATE User SET Username = ?, Password = ?, ProfilePicture = ? WHERE UserID = ?')
      .run(newUsername, newPasswordHash, newProfilePicture, UserID);

      // Update session to reflect new username
      req.session.User = { id: UserID, Username: newUsername, Admin: Number(req.session.User?.Admin || 0) };

      res.json({
        success: true,
        message: "User updated successfully",
        user: {
          id: UserID,
          username: newUsername,
          profilePicture: newProfilePicture
        }
      });
    } catch (error) {
      console.error('Update user error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
});
```

## Kanaler og Meldinger

Her er kode for å sende til riktig html fil basert på om brukeren har blitt satt som admin

Under der er kode for å lage en ny kanal i chatten og under der igjen er kode for å hente ut kanalene fra databasen

```js
// Rute for å vise chat.html eller admin (kun for innlogga brukarar)
app.get("/chat", requireLogin,(req, res) => { 
  if (Number(req.session.User?.Admin) === 1) {
    res.sendFile(__dirname + "/secure/admin.html"); // Hvis brukeren er admin, send dem til admin-siden
  } else {
    return res.redirect("/chat.html"); // Ellers send dem til chat-siden
  }
});

app.post('/channel', (req, res) => {
  const { ChannelName } = req.body;
  const stmt = db.prepare('INSERT INTO Channel (ChannelName) VALUES (?)');
  stmt.run(ChannelName);
  res.sendStatus(200);
});

app.get('/channel', (req, res) => {
  const stmt = db.prepare('SELECT * FROM Channel');
  const Channel = stmt.all();
  res.json(Channel);
});
```

Her er kode for å hente ut alle meldingene fra en spesifik kanal, den bruker en kolon ":" for å kunne spesifisere kanal id-en

```js
app.get('/Channel/:ChannelID/Messages', (req, res) => {
  const { ChannelID } = req.params;

  const stmt = db.prepare(`
    SELECT Messages.Content, Messages.ImagePath, User.Username, User.ProfilePicture, Messages.Time
    FROM Messages
    JOIN User ON Messages.UserID = User.UserID
    WHERE Messages.ChannelID = ?
  `);
  const Messages = stmt.all(ChannelID);

  res.json(Messages);
});
```

Her er kode som faktisk skriver ut meldingene inn i htmlen
Den fetch-er med den ruten over med variabelen currentChannelID.

Under så for hver melding så lager den en div for meldingen og et img tag for profilbilde, den setter content og stilsetting til profilbilde så lager den et element for Brukernavnet til brukeren, den append-er profilbilde og bruker til melding div-en

Under der så lager den element for eventuelt melding og bilde, i tillegg til timestamp for meldingen 

Under der så append-er den diven til melding konteineren.

```js
async function fetchMessages(currentChannelID, scroll = false) { //scroll parameter to decide whether to scroll down after fetching
    const response = await fetch(`/Channel/${currentChannelID}/Messages`);
    const messages = await response.json();
    const messagesContainer = document.getElementById('messages-container');
    messagesContainer.innerHTML = ''; // Tøm tidligere meldinger

    messages.forEach(msg => {
        const messageDiv = document.createElement('div');
        const profilePic = document.createElement('img');

        profilePic.src = msg.ProfilePicture;
        profilePic.alt = `${msg.Username} Profile Picture`;
        profilePic.style.width = '64px';
        profilePic.style.height = '64px';
        profilePic.style.marginRight = '10px';

        const UsernameContent = document.createElement('span');
        UsernameContent.textContent = `${msg.Username}:`;
        UsernameContent.style.fontWeight = 'bold';
        UsernameContent.style.color = 'steelblue';
        UsernameContent.style.fontFamily = 'Roboto, monospace';
        UsernameContent.style.fontSize = '1.3rem';

        messageDiv.append(profilePic, UsernameContent);

        if (msg.Content) {
            const messageContent = document.createElement('span');
            messageContent.textContent = ` ${msg.Content}`;
            messageContent.style.color = 'white';
            messageDiv.append(messageContent);
            messageDiv.style.overflowWrap = 'break-word';
        }

        const timeStamp = document.createElement('div');
        timeStamp.textContent = msg.Time;
        timeStamp.style.fontSize = '0.8em';
        timeStamp.style.color = 'gray';
        messageDiv.appendChild(timeStamp);

        if (msg.ImagePath) {
            const messageImage = document.createElement('img');
            messageImage.src = msg.ImagePath;
            messageImage.alt = 'Image sent in chat';
            messageImage.style.maxWidth = '750px';
            messageImage.style.maxHeight = '250px';
            messageImage.style.display = 'block';
            messageImage.style.marginTop = '10px';
            messageImage.style.marginLeft = '74px'; // align with text after profile pic
            messageDiv.append(messageImage);
        }

        messageDiv.style.marginBottom = '15px';
        messageDiv.style.borderBottom = '4px solid gray';
        messageDiv.style.paddingBottom = '10px';

        messagesContainer.append(messageDiv);
        
    });

     // Scroll to bottom after rendering messages, only if specified
    if (scroll) {
        const messagesContainerEl = document.getElementById('messages-container');
        if (messagesContainerEl) {
            messagesContainerEl.scrollTo({ top: messagesContainerEl.scrollHeight, behavior: 'smooth' });
        }
    }
}
```

Kode for å sende en melding inn i databasen, ganske likt som å lage en bruker bare at den må sende inn brukerID som jeg henter fra session og timestamp som jeg lager inne i ruten.

```js
app.post('/Channel/:ChannelID/Messages', upload.single('Image'), async (req, res) => {
    try {
        const UserID = req.session.User?.id; // Hent bruker-ID fra session
        const { Content } = req.body; // Hent tekst fra forespørselen
        const { ChannelID } = req.params;

        if (!UserID || !ChannelID || (!Content && !req.file)) {
            return res.status(400).json({ message: "Manglende data for å sende melding" });
        }

        let ImagePath = null;
        if (req.file) {
            // Compress + save the uploaded image as WebP
            const savedFilename = await saveImageBuffer(req.file.buffer, req.file.originalname, { width: 750, quality: 80 });
            ImagePath = `/Images/${savedFilename}`;
        }

        let now = new Date();
        let Time = now.getFullYear() + "-" +
          String(now.getMonth() + 1).padStart(2, '0') + "-" +
          String(now.getDate()).padStart(2, '0') + " " +
          String(now.getHours()).padStart(2, '0') + ":" +
          String(now.getMinutes()).padStart(2, '0') + ":" +
          String(now.getSeconds()).padStart(2, '0');

        const stmt = db.prepare('INSERT INTO Messages (UserID, ChannelID, Content, ImagePath, Time) VALUES (?, ?, ?, ?, ?)');
        stmt.run(UserID, ChannelID, Content || null, ImagePath, Time);

        res.sendStatus(200);
    } catch (error) {
        console.error('Message upload error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
```

Kode for å sende meldingen, den henter inputet i form av tekst og fil fra html siden og legger det til i en formData, så poster den det inn i ruten over.

```js
document.getElementById('send-button').addEventListener('click', async (event) => {
    event.preventDefault();

    const messageInput = document.getElementById('message-input');
    const imageInput = document.getElementById('image-input'); 
    const Content = messageInput.value.trim();
    const imageFile = imageInput.files && imageInput.files[0] ? imageInput.files[0] : null;

    if (!Content && !imageFile) return; // Unngå å sende tomme meldinger

    const formData = new FormData();
    if (Content) formData.append('Content', Content);
    if (imageFile) formData.append('Image', imageFile);

    await fetch(`/Channel/${currentChannelID}/Messages`, {
        method: 'POST',
        body: formData
    });

    messageInput.value = '';
    imageInput.value = '';
    fetchMessages(currentChannelID, true); //fetch messages and scroll down
});
```

## Hente og slette brukere (meldinger også)

Her er kode som henter alle brukerene
```js
app.get('/getUsers', (req, res) => {
  const stmt = db.prepare('SELECT UserID, Username, ProfilePicture FROM User ORDER BY Admin DESC, Username ASC');
  const Users = stmt.all();
  res.json(Users);
});
```

Her er kode som først sletter bilde fra serveren, så sletter den alle meldingene som hører til brukeren, så sletter jeg brukeren seg selv
```js
app.delete('/admin/deleteUsers/:UserID', (req, res) => {
  const { UserID } = req.params;

  try {
    // Delete images referenced by the user's messages
    const imagesStmt = db.prepare('SELECT ImagePath FROM Messages WHERE UserID = ? AND ImagePath IS NOT NULL');
    const images = imagesStmt.all(UserID);
    images.forEach(row => {
      if (row && row.ImagePath) {
        try {
          const filename = path.basename(row.ImagePath);
          const filePath = path.join(uploadDir, filename);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (e) {
          console.error('Failed to remove message image:', e);
        }
      }
    });

    // Delete the user's messages
    const deleteMessagesStmt = db.prepare('DELETE FROM Messages WHERE UserID = ?');
    deleteMessagesStmt.run(UserID);

    // Delete the user's profile picture (if any)
    const userStmt = db.prepare('SELECT ProfilePicture FROM User WHERE UserID = ?');
    const user = userStmt.get(UserID);
    if (user && user.ProfilePicture) {
      try {
        const filename = path.basename(user.ProfilePicture);
        const filePath = path.join(uploadDir, filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (e) {
        console.error('Failed to remove profile image:', e);
      }
    }

    // Delete the user row
    const deleteUserStmt = db.prepare('DELETE FROM User WHERE UserID = ?');
    const result = deleteUserStmt.run(UserID);

    if (result.changes > 0) {
      res.json({ message: 'User and messages deleted' });
    } else {
      res.status(404).json({ message: 'Bruker ikke funnet' });
    }
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});
```
Her er kode fra admin siden for å slette
```js
async function deleteUser(UserID) {
  const confirmed = confirm('Er du sikker på at du vil slette denne brukeren?');
  if (!confirmed) return;

  const response = await fetch(`/admin/deleteUsers/${UserID}`, {
    method: 'DELETE'
  });

  if (response.ok) {
    alert('Bruker og meldinger slettet');
    fetchUsers();
    fetchMessages(currentChannelID);
  } else {
    const result = await response.json();
    alert(result.message);
  }
}
```

Her er også hvordan brukerene blir vist på admin siden med en slette knapp ved siden av
```js
async function fetchUsers() {
    const response = await fetch('/getUsers');  
    const Users = await response.json();
    const userList = document.getElementById('user-list');
    userList.innerHTML = '';
    userList.style.display = 'flex';
    userList.style.flexDirection = 'column';
    userList.style.gap = '6px';

    Users.forEach(User => {

    const userRow = document.createElement('div');
    userRow.style.display = 'flex';
    userRow.style.alignItems = 'center';
    userRow.style.gap = '8px';
    userRow.style.padding = '4px 0';

    const profilePic = document.createElement('img');
    profilePic.src = User.ProfilePicture;
    profilePic.alt = `${User.Username} Profile Picture`;
    profilePic.style.width = '32px';
    profilePic.style.height = '32px';
    profilePic.style.objectFit = 'cover';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = `(${User.UserID}) ${User.Username}`;
    nameSpan.style.color = 'white';
    nameSpan.style.fontFamily = 'Roboto, monospace';

    const deleteButton = document.createElement('button');
    deleteButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="#ffffffff"><path d="M267.33-120q-27.5 0-47.08-19.58-19.58-19.59-19.58-47.09V-740H160v-66.67h192V-840h256v33.33h192V-740h-40.67v553.33q0 27-19.83 46.84Q719.67-120 692.67-120H267.33Zm425.34-620H267.33v553.33h425.34V-740Zm-328 469.33h66.66v-386h-66.66v386Zm164 0h66.66v-386h-66.66v386ZM267.33-740v553.33V-740Z"/></svg>';
    deleteButton.style.marginLeft = '-10px';
    deleteButton.style.background = 'none';
    deleteButton.style.border = 'none';
    deleteButton.style.cursor = 'pointer';
    deleteButton.addEventListener('click', () => deleteUser(User.UserID));

    userRow.append(profilePic, nameSpan, deleteButton);
    userList.appendChild(userRow);
    });
}
```