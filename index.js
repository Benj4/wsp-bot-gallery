// Importar la librería ws


const Fastify = require('fastify');
const fastifyStatic = require('@fastify/static');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const setupSavedPageRoute = require('./routes/savedPage');
const setupGalleryPageRoute = require('./routes/galleryPage'); 
const { getAndSaveImage } = require('./imageHandler');
const fastifyView = require('@fastify/view');
const ejs = require('ejs');



const app = Fastify({
  logger: true, // Changed to true
  bodyLimit: 104857600
});

// Register fastify-static for the root directory first.
// This instance will decorate the reply object with sendFile.
app.register(fastifyStatic, {
  root: __dirname, // Serve files like terms.html from the project root
  // decorateReply: true is the default, so sendFile will be added here.
});

app.register(fastifyView, {
  engine: {
    ejs: ejs,
  },
  root: path.join(__dirname, 'views'),
});

// const PrivateGPT = require('./PrivateGPT').PrivateGPT;
// const pgptclient = new PrivateGPT('http://localhost:8001');


// pgptclient.health()


const WspAPI = require('./WspAPI').WspAPI;

const wspClient = new WspAPI(process.env.WHATSAPP_API_TOKEN);


const db = new sqlite3.Database('./messages.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the messages database.');
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    fromNumber TEXT,
    timestamp INTEGER,
    type TEXT,
    text TEXT,
    mediaId TEXT,
    filename TEXT,
    userName TEXT,
    mime_type TEXT,
    saved INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    wa_id TEXT PRIMARY KEY,
    fromNumber TEXT,
    name TEXT,
    last_message_timestamp TEXT
  )`);
});


async function canSendResponse(db, wa_id, max_time_minutes = 5) {
  if (!wa_id) {
    console.error('wa_id is required to check last message timestamp');
    return false;
  }
  if (typeof max_time_minutes !== 'number' || max_time_minutes <= 0) {
    console.error('max_time_minutes must be a positive number');
    return true;
  }

  const secondsThreshold = max_time_minutes * 60;

  return new Promise((resolve, reject) => {
    db.get("SELECT last_message_timestamp FROM users WHERE wa_id = ?", [wa_id], (err, row) => {
      if (err) {
        console.error('Error fetching last message timestamp:', err.message);
        reject(err);
      } else {


        if (row && row.last_message_timestamp) { // Check if row exists
          console.log(`Last message timestamp for user ${wa_id}: ${row.last_message_timestamp}`);
          const lastMessageTimestamp = parseInt(row.last_message_timestamp);
          const currentTimestamp = Math.floor(Date.now() / 1000);
          if (currentTimestamp - lastMessageTimestamp > secondsThreshold) {
            resolve(true);
          }else {
            resolve(false);
          }
        } else { // If no row, resolve true
             resolve(true);
        }
      }
    });
  });
}

// app.use((req, res, next) => {
//   console.log(\`[\${new Date().toISOString()}] \${req.method} \${req.originalUrl}\`);
//   console.log('Headers:', JSON.stringify(req.headers));
//   console.log('Body:', JSON.stringify(req.body));
//   next(); // Continuar con el siguiente middleware o ruta
// });

// app.use(bodyParser.urlencoded({ extended: false }));
// app.use(bodyParser.json());

app.register(fastifyStatic, {
  root: path.join(__dirname, 'images'),
  prefix: '/images/',
  decorateReply: false, // Prevent this instance from re-decorating
});
app.register(fastifyStatic, {
  root: path.join(__dirname, 'assets'),
  prefix: '/assets/',
  decorateReply: false, // Prevent this instance from re-decorating
});


const PORT = 8085;

app.get("/", async (request, reply) => {
  return reply.send('(〜￣▽￣)〜*〜(￣▽￣〜)');
});

app.get('/terms', async (request, reply) => {
  return reply.sendFile('terms.html', path.join(__dirname, 'routes'));
});

app.get('/privacy', async (request, reply) => {
  return reply.sendFile('privacy.html', path.join(__dirname, 'routes'));
});

app.get('/favicon.ico', async (request, reply) => {
  return reply.sendFile('favicon.ico');
});

app.get('/wsp-webhook', async (request, reply) => {
  console.log('req.query :>> ', request.query, request.query['hub.mode'] == 'subscribe');
  if (
    request.query['hub.mode'] == 'subscribe'
    && request.query['hub.verify_token'] == 'tokenwspwebhook'
  ) {
    return reply.send(request.query['hub.challenge']);
  } else {
    return reply.code(400).send();
  }
});

app.post("/wsp-webhook", async function (request, reply) {

  if (!Array.isArray(request.body?.entry[0]?.changes[0]?.value?.messages)) {
    return reply.code(200).send();
  }

  console.log('Incoming webhook: ' + JSON.stringify(request.body));




  // const body = {"object":"whatsapp_business_account","entry":[{"id":"570722866113855","changes":[{"value":{"messaging_product":"whatsapp","metadata":{"display_phone_number":"15551851585","phone_number_id":"571783922674633"},"contacts":[{"profile":{"name":"Benja"},"wa_id":"56961719059"}],"messages":[{"from":"56961719059","id":"wamid.HBgLNTY5NjE3MTkwNTkVAgASGBYzRUIwRjg3REQ4RDlBODI5RDg5Njg5AA==","timestamp":"1744217396","text":{"body":"dqwdqw qwwq dw"},"type":"text"}]},"field":"messages"}]}]}
  // const message = { 
  //   "from": "56961719059", 
  //   "id": "wamid.HBgLNTY5NjE3MTkwNTkVAgASGBYzRUIwQUUwNDhFRjQyQ0UwQTU3QUY1AA==", 
  //   "timestamp": "1744217396", 
  //   "text": { "body": "dqwdqw qwwq dw" }, 
  //   "type": "text" 
  // }

  try {
    const message = request.body?.entry[0]?.changes[0]?.value?.messages[0];
    const contactInfo = request.body?.entry[0]?.changes[0]?.value?.contacts[0];
    let name = contactInfo?.profile?.name;
    const wa_id = contactInfo?.wa_id;
    const mediaType = message.type
    // const originalFrom = message.from; // Keep original 'from' for message table

    // Sanitize name for filename, but keep original for user table
    let sanitizedName = name.replace(/[^a-zA-Z0-9]/g, '');

    if (message && contactInfo) {
      // const fromForMessageTable = originalFrom + '_' + sanitizedName;


      const { id, timestamp, from, type } = message;
      let text = null;
      let mediaId = null;
      let mime_type = null;

      if (type === 'text') {
        text = message.text.body;
      } else if (message[mediaType] && message[mediaType].id) {

        mediaId = message[mediaType].id;
        mime_type = message[mediaType].mime_type;
        text = message[mediaType].caption;
      }

      // Upsert user information
      if (wa_id && sanitizedName) {
        const userStmt = db.prepare(`
          INSERT INTO users (wa_id, fromNumber, name, last_message_timestamp) 
          VALUES (?, ?, ?, ?)
          ON CONFLICT(wa_id) DO UPDATE SET
            name = excluded.name;
        `);
        userStmt.run(wa_id, from, sanitizedName, "0", function (err) {
          if (err) {
            return console.error('Error saving/updating user to DB:', err.message);
          }
          console.log(`User ${wa_id} (${sanitizedName}) saved/updated in users table.`);
        });
        userStmt.finalize();
      }


      const stmt = db.prepare("INSERT INTO messages (id, fromNumber, timestamp, type, text, mediaId, userName, mime_type, saved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
      stmt.run(id, from, parseInt(timestamp), type, text, mediaId, sanitizedName, mime_type, 0, function (err) {
        if (err) {
          return console.error('Error saving message to DB:', err.message);
        }
        console.log(`Message ${id} saved to database with rowid ${this.lastID}`);
      });
      stmt.finalize();
    }

    if (message && message.type === 'text') {
      console.log('message :>> ', message);
      const textBody = message.text.body;
      // const fromNum = message.from;
      // const id = message.id; // id is already defined above

      // Aquí puedes procesar el mensaje de texto como desees
      console.log(`Received text message from ${message.from}: ${textBody}`);
      let sendreponse = true;
      try {
        sendreponse = await canSendResponse(db, contactInfo.wa_id, 5);
        console.log(`canSendResponse for user ${contactInfo.wa_id}: ${sendreponse}`);
      } catch (err) {
        console.error('Error in last message timestamp logic:', err);
      }
      
      wspClient.sendMessage(message.from, `Hola, puedes enviarme fotos o videos recueda usar la opcion HD para que se vean mejor.`);

    } else if (message[mediaType] && message[mediaType].id) {

      await getAndSaveImage(message, db, sanitizedName);

      let sendreponse = true;
      try {
        sendreponse = await canSendResponse(db, contactInfo.wa_id, 5);
        console.log(`canSendResponse for user ${contactInfo.wa_id}: ${sendreponse}`);
      } catch (err) {
        console.error('Error in last message timestamp logic:', err);
      }


      if (sendreponse) {
        console.log('Enviando respuesta al usuario');

        const galleryUrl = `https://wspwebhook.bdiazcaballero.com/gallery?user=${message.from}`;
        await wspClient.sendMessage(message.from, `Hola ${sanitizedName}, gracias por enviar tus fotos. Puedes verlas en la galería: ${galleryUrl}`);

        // Update the last_message_timestamp in the users table
        const updateStmt = db.prepare("UPDATE users SET last_message_timestamp = ? WHERE wa_id = ?");
        updateStmt.run(Math.floor(Date.now() / 1000).toString(), contactInfo.wa_id, function (updateErr) {
          if (updateErr) {
            console.error('Error updating last message timestamp:', updateErr.message);
          } else {
            console.log(`User ${contactInfo.wa_id} last_message_timestamp updated.`);
          }
        });
        updateStmt.finalize();
      }


    }

  } catch (error) {
    console.error('Error processing webhook:', error);
  }


  return reply.code(200).send();
});

app.get('/reprocess', async (request, reply) => {
  try {
    // Fastify route handlers expect a Promise to be returned if they are async.
    // The db.all callback needs to be wrapped in a Promise or the outer function
    // will return before db.all finishes, leading to reply being sent too early or multiple times.
    return new Promise((resolve, reject) => { // Wrap db.all in a promise
      db.all("SELECT id, fromNumber, timestamp, type, mediaId, userName, mime_type FROM messages WHERE (type = 'image' OR type = 'video' OR type = 'audio') AND saved = 0", [], async (err, rows) => {
        if (err) {
          console.error('Error fetching messages for reprocessing:', err.message);
          // When rejecting, Fastify handles sending a 500 error
          return reject(new Error('Error fetching messages for reprocessing.')); 
        }

        if (rows.length === 0) {
          resolve(reply.send('No images to reprocess.')); // Resolve the promise with the reply
          return;
        }

        let processedCount = 0;
        let errorCount = 0;

        for (const row of rows) {
          const messageToReprocess = {
            id: row.id, // WAMID
            image: { id: row.mediaId, mime_type: row.mime_type },
            video: { id: row.mediaId, mime_type: row.mime_type },
            audio: { id: row.mediaId, mime_type: row.mime_type },
            type: row.type,
            from: row.fromNumber,
            timestamp: row.timestamp
          };

          try {
            console.log(`Reprocessing WAMID: ${messageToReprocess.id}, Media ID: ${messageToReprocess.image.id}`);
            await getAndSaveImage(messageToReprocess, db, row.userName);
            processedCount++;
          } catch (processError) {
            console.error(`Error reprocessing WAMID ${messageToReprocess.id}:`, processError.message);
            errorCount++;
          }
        }
        // Corrected template literal
        resolve(reply.send(`Reprocessing complete. Processed: ${processedCount}, Errors: ${errorCount}`)); 
      });
    });
  } catch (error) {
    console.error('Outer error in /reprocess endpoint:', error);
    // If an error occurs outside the promise, send a 500 response.
    return reply.code(500).send('Internal server error during reprocessing initiation.');
  }
});

// /saved
setupSavedPageRoute(app, db);

// /gallery
setupGalleryPageRoute(app, db);

// server.on('request', app); // Not needed with Fastify
// server.listen(PORT, () => { // Replaced with app.listen
//   console.log(\`Server is running on port \${PORT}\`);
// });

const start = async () => {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' }); // Listen on all available network interfaces
    app.log.info(`Server listening on ${app.server.address().port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

const post = {
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "570722866113855",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "15551851585",
              "phone_number_id": "571783922674633"
            },
            "contacts": [{ "profile": { "name": "Benja" }, "wa_id": "56961719059" }],
            "messages": [
              {
                "from": "56961719059",
                "id": "wamid.HBgLNTY5NjE3MTkwNTkVAgASGBYzRUIwQUUwNDhFRjQyQ0UwQTU3QUY1AA==",
                "timestamp": "1735850641",
                "text": { "body": "nomediga" },
                "type": "text"
              }]
          },
          "field": "messages"
        }
      ]
    }]
}

const imageMessage = {
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "2517940031870923",
    "changes": [{
      "value": {
        "messaging_product":
          "whatsapp",
        "metadata": { "display_phone_number": "56946576397", "phone_number_id": "634101996450708" },
        "contacts": [{
          "profile": { "name": "Benja" },
          "wa_id": "56961719059"
        }],
        "messages": [{
          "from": "56961719059",
          "id": "wamid.HBgLNTY5NjE3MTkwNTkVAgASGBYzRUIwODZBRURENDE5QTU1QjQxMzhGAA==",
          "timestamp": "1747538288",
          "type": "image",
          "image": {
            "caption": "te llega si te escribo por aqui?",
            "mime_type": "image/jpeg",
            "sha256": "U4JQr9Q7DR7g44MfDsV3glVapi/+UMvVFOdzdQ9nbik=", "id": "1269597907898981"
          }
        }]
      },
      "field": "messages"
    }]
  }]
}