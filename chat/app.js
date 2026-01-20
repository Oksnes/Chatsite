const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const db = require('better-sqlite3')('chat.db');
const multer = require('multer');
const path = require('path');
const sharp = require('sharp');
const { spawn, execFile } = require('child_process');
const util = require('util');
const app = express();
const PORT = 3000;


const uploadDir = path.join(__dirname, 'public/Images');
// Create uploads directory if it doesn't exist
const fs = require('fs');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer with disk storage
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg'];
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
    }
});

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


app.get('/', (req, res) => { //sender deg til index.html som standard.
    res.sendFile(__dirname + '/public/index.html');
});

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

app.get('/getCurrentUser', (req, res) => {
  if (!req.session.User) {
      return res.status(401).json({ message: "Not logged in" });
  }

  const UserID = req.session.User.id;
  const stmt = db.prepare('SELECT UserID, Username, ProfilePicture, Admin FROM User WHERE UserID = ?');
  const user = stmt.get(UserID);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  req.session.User = { id: user.UserID, Username: user.Username, Admin: Number(user.Admin || 0) };

  res.json({ 
      success: true, 
      user: { 
          id: user.UserID,
          username: user.Username,
          profilePicture: user.ProfilePicture,
          admin: Number(user.Admin || 0)
      }
  });
});

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

// Rute for innlogging
app.post ("/login", async (req, res) => {
  const { Username, Password } = req.body; //data fra login.html

  const User = db.prepare("SELECT * FROM User WHERE UserName = ?").get(Username); //Ser I databasen for brukeren jeg prøver å logge meg inn som
  if (!User) { //Om brukeren ikke finnes i databasen
      return res.status(401).json({ message: "Feil Brukernavn eller passord" });
  }

  const PasswordIsValid = await bcrypt.compare(Password, User.Password); //Ser om passordet du skriver er det samme som er kryptert i databasen
  if (!PasswordIsValid) { //om passordet ikke stemmer
      return res.status(401).json({ message: "Feil Brukernavn eller passord" });
  }

  // Lagre brukerdata i session
  req.session.User = { id: User.UserID, Username: User.Username, Admin: Number(User.Admin || 0) }; //gir sessionene din disse dataene
  res.json({ message: "Innlogging vellykket" });
});



// Rute for å logge ut
app.post("/logout", (req, res) => { //DENNE KODEN BRUKER JEG IKKE NÅ
  req.session.destroy(); //stopper sessionen
  res.json({ message: "Du er logget ut" });
});

// Rute for å vise chat.html eller admin (kun for innlogga brukarar)
app.get("/chat", requireLogin,(req, res) => { 
  if (!req.session.User) {
    return res.redirect("/login.html"); // Hvis brukeren ikke er logget inn, send dem til login-siden
  }
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

app.get('/Channel/:ChannelID/Messages', (req, res) => {
  const { ChannelID } = req.params;

  const stmt = db.prepare(`
    SELECT Messages.MessageID, Messages.Content, Messages.ImagePath, User.Username, User.ProfilePicture, Messages.Time
    FROM Messages
    JOIN User ON Messages.UserID = User.UserID
    WHERE Messages.ChannelID = ?
  `);
  const Messages = stmt.all(ChannelID);

  res.json(Messages);
});

app.put('/admin/deletemessage/:MessageID', requireAdmin, (req, res) => {
  const { MessageID } = req.params;

  try {
    // Delete image referenced by the message
    const imagesStmt = db.prepare('SELECT ImagePath FROM Messages WHERE MessageID = ? AND ImagePath IS NOT NULL');
    const images = imagesStmt.all(MessageID);
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

    const stmt = db.prepare('UPDATE Messages SET Content = ?, ImagePath = ? WHERE MessageID = ?');
    const result = stmt.run("This Message Was Deleted.", "", MessageID);

    if (result.changes > 0) {
      res.json({ message: 'Melding slettet' });
    } else {
      res.status(404).json({ message: 'Melding ikke funnet' });
    }


  } catch (error) {
    console.error('Delete message image error:', error);
    // continue to delete message record even if image deletion fails
  }

});

app.get('/getUsers', (req, res) => {
  const stmt = db.prepare('SELECT UserID, Username, ProfilePicture FROM User ORDER BY Admin DESC, Username ASC');
  const Users = stmt.all();
  res.json(Users);
});

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
    const deleteMessagesStmt = db.prepare('UPDATE Messages SET Content = ?, ImagePath = ?, UserID = ? WHERE UserID = ?');
    deleteMessagesStmt.run("This Message Was Deleted.", "", 17, UserID);

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

//åpner port på serveren
app.listen(PORT, () => {
  console.log(`Serveren kjører på http://localhost:${PORT}`);
});