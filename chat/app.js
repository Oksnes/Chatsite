const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const db = require('better-sqlite3')('chat.db');
const multer = require('multer');
const path = require('path');
const sharp = require('sharp');

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

async function saveImageBuffer(buffer, originalname, opts = {}) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(originalname || '').toLowerCase();

    // Default resize width and quality, can be overridden via opts
    const width = opts.width || 375;
    const quality = typeof opts.quality === 'number' ? opts.quality : 50;


        // If original is GIF, save the buffer directly as .gif to preserve animation
    if (ext === '.gif') {
        const filename = `Multer-Image-${uniqueSuffix}.gif`;
        const outPath = path.join(uploadDir, filename);
        fs.writeFileSync(outPath, buffer);
        return filename;
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
    } else { // webp
        transformer = transformer.webp({ quality });
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
    SELECT Messages.Content, Messages.ImagePath, User.Username, User.ProfilePicture, Messages.Time
    FROM Messages
    JOIN User ON Messages.UserID = User.UserID
    WHERE Messages.ChannelID = ?
  `);
  const Messages = stmt.all(ChannelID);

  res.json(Messages);
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

//åpner port på serveren
app.listen(PORT, () => {
  console.log(`Serveren kjører på http://localhost:${PORT}`);
});