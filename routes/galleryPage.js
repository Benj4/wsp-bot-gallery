const ejs = require('ejs');
const path = require('path');
const fs = require('fs');
const ITEMS_PER_PAGE = 10;

function setupGalleryPageRoute(app, db) {
  app.get('/gallery', async (req, reply) => {
    console.log("Received request for /gallery with query:", req.query);
    try {
      const selectedUserFromNumber = req.query.user;
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || ITEMS_PER_PAGE;
      const offset = (page - 1) * limit;
      const isPartialRequest = req.query.partial === 'true';

      let mediaQuery = "SELECT filename, text, type, userName, fromNumber, timestamp FROM messages WHERE filename IS NOT NULL";
      const queryParams = [];

      if (selectedUserFromNumber && selectedUserFromNumber !== "") {
        mediaQuery += " AND fromNumber = ?";
        queryParams.push(selectedUserFromNumber);
      }
      mediaQuery += " ORDER BY timestamp DESC LIMIT ? OFFSET ?";
      queryParams.push(limit, offset);

      const mediaRows = await new Promise((resolve, reject) => {
        db.all(mediaQuery, queryParams, (err, rows) => {
          if (err) {
            console.error("DB Error fetching media:", err);
            reject(err);
          } else {
            resolve(rows);
          }
        });
      });

      if (isPartialRequest) {
        // For AJAX requests, send only the HTML for the new media items
        // by rendering the _gallery_item.ejs partial for each item.
        let itemsHtml = '';
        for (const row of mediaRows) {
          const galleryItemTemplatePath = path.join(__dirname, '..', 'views', '_gallery_item.ejs');
          const galleryItemTemplateContent = fs.readFileSync(galleryItemTemplatePath, 'utf-8');
          const compiledGalleryItemTemplate = ejs.compile(galleryItemTemplateContent);
          const itemHtml = compiledGalleryItemTemplate({ row: row });
          itemsHtml += itemHtml;
        }

        reply.type('text/html');
        return reply.send(itemsHtml);
      } else {
        const users = await new Promise((resolve, reject) => {
          db.all("SELECT DISTINCT name, fromNumber FROM users WHERE name IS NOT NULL AND fromNumber IS NOT NULL ORDER BY name ASC", [], (err, users) => {
            if (err) {
              console.error("DB Error fetching users:", err);
              reject(err);
            } else {
              resolve(users);
            }
          });
        });

        const selectedUserName = users.find(user => user.fromNumber === selectedUserFromNumber)?.name || '';


        return reply.view('gallery.ejs', {
          users: users,
          mediaRows: mediaRows,
          selectedUserFromNumber: selectedUserFromNumber,
          selectedUserName: selectedUserName,
          limit: limit,
        });
      }
    } catch (err) {
      console.error('Error in /gallery route:', err.message, err.stack);
      if (req.query.partial === 'true') {
        reply.code(500).send("<!-- Error loading partial content -->");
      } else {
        reply.code(500).send("Error processing gallery request. Please check server logs.");
      }
    }
  });
}

module.exports = setupGalleryPageRoute;
