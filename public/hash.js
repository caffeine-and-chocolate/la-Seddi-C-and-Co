const bcrypt = require('bcryptjs');

const password = 'plaintextpassword'; // replace with the real password you want
bcrypt.hash(password, 10, (err, hash) => {
  if (err) throw err;
  console.log('Hashed password:', hash);
});
