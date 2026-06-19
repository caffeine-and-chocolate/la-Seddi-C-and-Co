
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