const mysql = require('mysql2');
const bcrypt = require('bcryptjs');

// Connect to DB
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'restaurant_db'
});

// Fetch all staff records
db.query('SELECT id, username, password FROM staff', async (err, results) => {
  if (err) {
    console.error('Error fetching staff:', err);
    return;
  }

  for (const staff of results) {
    const currentPassword = staff.password;

    // Detect if already hashed (bcrypt hashes start with $2b$ or $2a$)
    if (currentPassword.startsWith('$2b$') || currentPassword.startsWith('$2a$')) {
      console.log(`Skipping ${staff.username}, already hashed.`);
      continue;
    }

    try {
      const hashed = await bcrypt.hash(currentPassword, 10);

      // Update DB with hashed password
      db.query('UPDATE staff SET password=? WHERE id=?', [hashed, staff.id], (err2) => {
        if (err2) {
          console.error(`Error updating ${staff.username}:`, err2);
        } else {
          console.log(`Updated ${staff.username} to hashed password.`);
        }
      });
    } catch (e) {
      console.error(`Error hashing ${staff.username}:`, e);
    }
  }
});
