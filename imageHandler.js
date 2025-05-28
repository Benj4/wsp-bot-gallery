const { WspAPI } = require('./WspAPI');

// Assuming tokenWhatsAppApi is defined in this scope, e.g., from process.env or a config file
// const tokenWhatsAppApi = process.env.WHATSAPP_API_TOKEN; // Example: replace with actual source

const isMediaMessage = (messageData) => {
  if (!messageData || !messageData.type) {
    return false;
  }
  const mediaTypes = ["video", "image", "audio", "document", "sticker"];
  // const mediaTypes = ["video", "image", "audio"];
  return mediaTypes.includes(messageData.type) && messageData[messageData.type]?.id;
};

async function getAndSaveImage(message, db, userName) {

  const wspClient = new WspAPI(process.env.WHATSAPP_API_TOKEN);

  try {
    const mediaId = isMediaMessage(message);
    if (!mediaId) {
      console.error('No media ID found in the message');
      return;
    }

    const mime_type = message[message.type].mime_type;

    // Use the WspAPI instance to call retrieveMediaUrl
    const responseRetrieveMediaUrl = await wspClient.retrieveMediaUrl(mediaId);
    console.log('Media URL retrieved:', responseRetrieveMediaUrl); // Log the response for now

    // Further processing with responseRetrieveMediaUrl would go here
    // For example, calling downloadMedia:
    if (responseRetrieveMediaUrl && responseRetrieveMediaUrl.url) {

      let extension = '.jpg'; // Default extension
      if (mime_type) {
        const pre = mime_type.split(';')[0];
        const parts = pre.split('/');
        if (parts.length === 2) {
          extension = '.' + parts[1];
        }
      }

      // create a random filename with the number from message, name and add the determined extension
      const randomFileName = `${message.from}_${userName}_${Date.now()}${extension}`;
      console.log('Random file name:', randomFileName);


      await wspClient.downloadMedia(responseRetrieveMediaUrl.url, './images/' + randomFileName);


      // Update the saved status and filename in the database
      const updateStmt = db.prepare("UPDATE messages SET saved = 1, filename = ? WHERE id = ?");
      updateStmt.run(randomFileName, message.id, function (updateErr) {
        if (updateErr) {
          console.error('Error updating saved status and filename:', updateErr.message);
        } else {
          console.log(`Message ${message.id} marked as saved with filename ${randomFileName}.`);
        }
      });
      updateStmt.finalize();


      return randomFileName;

    }


  } catch (error) {
    console.error('Error in getAndSaveImage:', error.message);
  }

  throw new Error('Failed to get and save image');

}

module.exports = { getAndSaveImage, isMediaMessage };
