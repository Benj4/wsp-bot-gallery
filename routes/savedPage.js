function setupSavedPageRoute(app, db) {
  app.get('/saved', (req, reply) => { // Changed res to reply for Fastify
    console.log("Received request for /saved");
    db.all("SELECT id, fromNumber, timestamp, type, text, filename, mediaId, saved FROM messages ORDER BY timestamp DESC", [], (err, rows) => {
      if (err) {
        reply.code(500).send("Error querying database"); // Used reply.code(500).send
        return console.error(err.message);
      }
      // Render the EJS template instead of manually creating HTML
      reply.view('saved.ejs', { rows: rows }); // Pass rows to the template
    });
  });
}

module.exports = setupSavedPageRoute;
