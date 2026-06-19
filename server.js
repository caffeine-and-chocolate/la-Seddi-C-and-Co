const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');


const path = require('path');

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});


const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

// Helper function to format datetime
function formatDateTime(input) {
  // Browser gives "2026-06-14T19:00"
  const date = new Date(input);
  // Format as "YYYY-MM-DD HH:MM:SS"
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:00`;
}


// Staff login route
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  db.query('SELECT * FROM staff WHERE username = ?', [username], (err, results) => {
    if (err) return res.status(500).send('Database error');
    if (results.length === 0) return res.status(401).send('Invalid username or password');

    const staff = results[0];

    bcrypt.compare(password, staff.password, (err, match) => {
      if (match) {
        res.send('Login successful');
      } else {
        res.status(401).send('Invalid username or password');
      }
    });
  });
});

// Reservation route
app.post('/reservations', (req, res) => {
  const { reservationName, contactNumber, email, reservationDate, quantity, branch } = req.body;
  const formattedDate = formatDateTime(reservationDate);
  
  console.log('Incoming reservation:', req.body);
  console.log('Formatted date:', formattedDate);

  const checkSql = `
  SELECT * FROM reservations
  WHERE branch = ?
    AND reservationDate = ?
  `;

  db.query(checkSql, [branch, formattedDate], (err, results) => {
    if (err) {
      console.error('Check error:', err.sqlMessage);
      return res.status(500).send('Database error: ' + err.sqlMessage);
    }


    if (results.length > 0) {
      // Slot already taken
      return res.status(409).send('Sorry, this time slot is already booked at ' + branch);
    }

    // Insert new reservation
    const insertSql = `
      INSERT INTO reservations (reservationName, contactNumber, email, reservationDate, quantity, branch, status)
      VALUES (?, ?, ?, ?, ?, ?, 'Pending')
    `;

    db.query(insertSql, [reservationName, contactNumber, email, formattedDate, quantity, branch], (err, result) => {
      if (err) {
        console.error('Insert error:', err.sqlMessage);
        return res.status(500).send('Database error: ' + err.sqlMessage);
      }
      res.send('Reservation successful! Pending confirmation.');
    });
  });
});

// Get all events
app.get('/api/events', (req, res) => {
  db.query('SELECT * FROM events', (err, results) => {
    if (err) return res.status(500).send('Database error');
    res.json(results);
  });
});

app.post('/api/events', (req, res) => {
  const { eventName, eventDate, description, branch } = req.body;

  const formattedDate = formatDateTime(eventDate);

  db.query(
    'INSERT INTO events (eventName, eventDate, description, branch) VALUES (?, ?, ?, ?)',
    [eventName, formattedDate, description, branch],
    (err) => {
      if (err) {
        console.error('Event insert error:', err.sqlMessage);
        return res.status(500).send('Database error: ' + err.sqlMessage);
      }
      res.send('Event created');
    }
  );
});

// Update event (admin)
app.put('/api/events/:id', (req, res) => {
  const { id } = req.params;
  const { eventName, eventDate, description, branch } = req.body;
  db.query(
    'UPDATE events SET eventName=?, eventDate=?, description=?, branch=? WHERE id=?',
    [eventName, eventDate, description, branch, id],
    (err) => {
      if (err) return res.status(500).send('Database error');
      res.send('Event updated');
    }
  );
});

// Delete event (admin)
app.delete('/api/events/:id', (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM events WHERE id=?', [id], (err) => {
    if (err) return res.status(500).send('Database error');
    res.send('Event deleted');
  });
});

// Admin reservations route
app.get('/api/admin/reservations/:branch', (req, res) => {
  const branch = req.params.branch;

  const sql = `
    SELECT id, reservationName, contactNumber, email, reservationDate, quantity, status
    FROM reservations
    WHERE branch = ?
    ORDER BY reservationDate ASC
  `;

  db.query(sql, [branch], (err, results) => {
    if (err) {
      console.error('Admin reservations error:', err.sqlMessage);
      return res.status(500).send('Database error: ' + err.sqlMessage);
    }
    res.json(results);
  });
});

// Update reservation status + send email
app.put('/api/admin/reservations/:id', (req, res) => {
  const id = req.params.id;
  const { status } = req.body;

  const sql = `UPDATE reservations SET status = ? WHERE id = ?`;

  db.query(sql, [status, id], (err, result) => {
    if (err) {
      console.error('Update status error:', err.sqlMessage);
      return res.status(500).send('Database error: ' + err.sqlMessage);
    }

    // Fetch reservation details to email customer
    db.query(`SELECT * FROM reservations WHERE id = ?`, [id], (err, rows) => {
      if (err || rows.length === 0) {
        return res.send(`Reservation ${status}, but failed to fetch details.`);
      }

      const reservation = rows[0];
      const mailOptions = {
        from: 'lesediadm@gmail.com',
        to: reservation.email,
        subject: `Reservation ${status} - La’Seddi C & Co`,
        text: `Dear ${reservation.reservationName},

Your reservation at ${reservation.branch} on ${reservation.reservationDate} has been ${status}.

Thank you,
La’Seddi C & Co`
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('Email error:', error);
        } else {
          console.log('Email sent:', info.response);
        }
      });

      res.send(`Reservation ${status} and customer notified.`);
    });
  });
});

// Add RSVP
app.post('/api/events/:eventId/rsvp', (req, res) => {
  const { eventId } = req.params;
  const { name, email, phone, branch } = req.body;

  const sql = `
    INSERT INTO rsvps (eventId, name, email, phone, branch, status)
    VALUES (?, ?, ?, ?, ?, 'Pending')
  `;
  db.query(sql, [eventId, name, email, phone, branch], (err) => {
    if (err) {
      console.error('RSVP insert error:', err.sqlMessage);
      return res.status(500).send('Database error: ' + err.sqlMessage);
    }

    // Fetch event name
    const eventSql = `SELECT eventName FROM events WHERE id = ?`;
    db.query(eventSql, [eventId], (err, results) => {
      if (err || results.length === 0) {
        console.error('Event lookup error:', err?.sqlMessage || 'No event found');
        return res.status(500).send('Could not fetch event details');
      }

      const eventName = results[0].eventName;

      const mailOptions = {
        from: 'lesediadm@gmail.com',
        to: email,
        subject: `RSVP Received - La’Seddi C & Co`,
        text: `Dear ${name},

Thank you for your RSVP for our event "${eventName}" at ${branch}.
Your RSVP is currently marked as Pending. Our staff will confirm shortly.

Event ID: ${eventId}
Contact: ${phone}

Kind regards,
La’Seddi C & Co`
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('RSVP email error:', error);
        } else {
          console.log('RSVP email sent:', info.response);
        }
      });

      res.send('RSVP submitted and email sent.');
    });
  });
});

// Admin: view RSVPs per branch & event
app.get('/api/rsvps/:branch/:eventId', (req, res) => {
  const { branch, eventId } = req.params;
  db.query('SELECT * FROM rsvps WHERE branch=? AND eventId=?', [branch, eventId], (err, results) => {
    if (err) return res.status(500).send('Database error');
    res.json(results);
  });
});

// Admin: update RSVP status + send email
app.put('/api/rsvps/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  // Update RSVP status
  db.query('UPDATE rsvps SET status=? WHERE id=?', [status, id], (err) => {
    if (err) {
      console.error('RSVP update error:', err.sqlMessage);
      return res.status(500).send('Database error: ' + err.sqlMessage);
    }

    // Fetch RSVP details
    db.query('SELECT * FROM rsvps WHERE id=?', [id], (err, rows) => {
      if (err || rows.length === 0) {
        return res.send(`RSVP ${status}, but failed to fetch details.`);
      }

      const rsvp = rows[0];
      const mailOptions = {
        from: 'lesediadm@gmail.com',
        to: rsvp.email,
        subject: `RSVP ${status} - La’Seddi C & Co`,
        text: `Dear ${rsvp.name},

Your RSVP for the event at La'Seddi C & Co in ${rsvp.branch} has been ${status}.

Thank you,
La’Seddi C & Co`
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('RSVP email error:', error);
        } else {
          console.log('RSVP email sent:', info.response);
        }
      });

      res.send(`RSVP ${status} and customer notified.`);
    });
  });
});


// Admin: load RSVPs per branch & event
app.get('/api/admin/rsvps/:branch/:eventId', (req, res) => {
  const { branch, eventId } = req.params;
  db.query('SELECT * FROM rsvps WHERE branch=? AND eventId=?', [branch, eventId], (err, results) => {
    if (err) return res.status(500).send('Database error');
    res.json(results);
  });
});

// Admin: update RSVP status
app.put('/api/admin/rsvps/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  db.query('UPDATE rsvps SET status=? WHERE id=?', [status, id], (err) => {
    if (err) return res.status(500).send('Database error');
    res.send(`RSVP ${status}`);
  });
});

// Get all promotions
app.get('/api/promotions', (req, res) => {
  db.query('SELECT * FROM promotions', (err, results) => {
    if (err) return res.status(500).send('Database error');
    res.json(results);
  });
});

// Add promotion (admin)
app.post('/api/promotions', (req, res) => {
  const { title, description, startDate, endDate, branch } = req.body;

  // Debugging logs
  console.log('Incoming promotion:', req.body);

  // Convert HTML datetime-local to MySQL format
  const formattedStart = formatDateTime(startDate);
  const formattedEnd = formatDateTime(endDate);

  // Debugging logs for formatted dates
  console.log('Formatted dates:', formattedStart, formattedEnd);

  db.query(
    'INSERT INTO promotions (title, description, startDate, endDate, branch) VALUES (?, ?, ?, ?, ?)',
    [title, description, formattedStart, formattedEnd, branch],
    (err) => {
      if (err) {
        console.error('Promotion insert error:', err.sqlMessage);
        return res.status(500).send('Database error: ' + err.sqlMessage);
      }
      res.send('Promotion created');
    }
  );
});

// Update promotion
app.put('/api/promotions/:id', (req, res) => {
  const { id } = req.params;
  const { title, description, startDate, endDate, branch } = req.body;
  db.query(
    'UPDATE promotions SET title=?, description=?, startDate=?, endDate=?, branch=? WHERE id=?',
    [title, description, startDate, endDate, branch, id],
    (err) => {
      if (err) return res.status(500).send('Database error');
      res.send('Promotion updated');
    }
  );
});

// Delete promotion
app.delete('/api/promotions/:id', (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM promotions WHERE id=?', [id], (err) => {
    if (err) return res.status(500).send('Database error');
    res.send('Promotion deleted');
  });
});

// Get all menu items
app.get('/api/menu', (req, res) => {
  db.query('SELECT * FROM menuitems', (err, results) => {
    if (err) return res.status(500).send('Database error: ' + err.sqlMessage);
    res.json(results);
  });
});

// Add menu item (admin)
app.post('/api/menu', (req, res) => {
  const { itemName, description, price, category } = req.body;
  
  console.log('Incoming menu item:', req.body);
  
  db.query(
    'INSERT INTO menuitems (itemName, description, price, category) VALUES (?, ?, ?, ?)',
    [itemName, description, price, category],
    (err) => {
      if (err) {
        console.error('Menu insert error:', err.sqlMessage);
        return res.status(500).send('Database error: ' + err.sqlMessage);
      }
      res.send('Menu item created');
    }
  );
});

// Update menu item
app.put('/api/menu/:id', (req, res) => {
  const { id } = req.params;
  const { itemName, description, price, category } = req.body;
  db.query(
    'UPDATE menuitems SET itemName=?, description=?, price=?, category=? WHERE id=?',
    [itemName, description, price, category, id],
    (err) => {
      if (err) return res.status(500).send('Database error: ' + err.sqlMessage);
      res.send('Menu item updated');
    }
  );
});

// Delete menu item
app.delete('/api/menu/:id', (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM menuitems WHERE id=?', [id], (err) => {
    if (err) return res.status(500).send('Database error: ' + err.sqlMessage);
    res.send('Menu item deleted');
  });
});

// Get all reviews
app.get('/api/reviews', (req, res) => {
  db.query('SELECT * FROM reviews ORDER BY createdAt DESC', (err, results) => {
    if (err) return res.status(500).send('Database error: ' + err.sqlMessage);
    res.json(results);
  });
});

// Add new review (customer)
app.post('/api/reviews', (req, res) => {
  const { customerName, rating, feedback } = req.body;
  db.query(
    'INSERT INTO reviews (customerName, rating, feedback) VALUES (?, ?, ?)',
    [customerName, rating, feedback],
    (err) => {
      if (err) return res.status(500).send('Database error: ' + err.sqlMessage);
      res.send('Review submitted');
    }
  );
});

// Admin: respond to review
app.put('/api/reviews/:id/response', (req, res) => {
  const { id } = req.params;
  const { adminResponse } = req.body;
  db.query(
    'UPDATE reviews SET adminResponse=? WHERE id=?',
    [adminResponse, id],
    (err) => {
      if (err) return res.status(500).send('Database error: ' + err.sqlMessage);
      res.send('Response added');
    }
  );
});

// Admin: delete review
app.delete('/api/reviews/:id', (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM reviews WHERE id=?', [id], (err) => {
    if (err) return res.status(500).send('Database error: ' + err.sqlMessage);
    res.send('Review deleted');
  });
});

// Get all contact messages (admin)
app.get('/api/contacts', (req, res) => {
  db.query('SELECT * FROM contacts ORDER BY createdAt DESC', (err, results) => {
    if (err) return res.status(500).send('Database error: ' + err.sqlMessage);
    res.json(results);
  });
});

// Add new contact message (customer)
app.post('/api/contacts', (req, res) => {
  const { name, email, message } = req.body;

  console.log('Incoming contact message:', req.body);

  db.query(
    'INSERT INTO contacts (name, email, message) VALUES (?, ?, ?)',
    [name, email, message],
    (err) => {
      if (err) {
        console.error('Contact insert error:', err.sqlMessage);
        return res.status(500).send('Database error: ' + err.sqlMessage);
      }
      res.send('Message submitted');
    }
  );
});

// Delete contact message (admin)
app.delete('/api/contacts/:id', (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM contacts WHERE id=?', [id], (err) => {
    if (err) return res.status(500).send('Database error: ' + err.sqlMessage);
    res.send('Contact message deleted');
  });
});

// Start server
app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
