// const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class WspAPI {
  constructor(accessToken) {
    this.accessToken = accessToken;
    // It seems the base API URL for media is different from messages.
    // We'll use the direct graph.facebook.com URL for media operations.
    this.apiUrl = 'https://graph.facebook.com/v22.0';
  }

  sendMessage(to, messageBody) {
    return new Promise((resolve, reject) => {

      const body = JSON.stringify({
        messaging_product: "whatsapp",
        to: to,
        text: {
          body: messageBody,
        },
      });

      const url = new URL(this.apiUrl + "/634101996450708/messages");
      const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };

      const req = https.request(options, (res) => {
        let rawData = '';
        res.setEncoding('utf8');

        res.on('data', (chunk) => {
          rawData += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(rawData));
          } else {
            reject(new Error(`HTTP Error: ${res.statusCode} - ${rawData}`));
          }
        });
      });

      req.on('error', (e) => {
        reject(new Error(`Problem with request: ${e.message}`));
      });

      req.write(body);
      req.end();
    });
  }

  async retrieveMediaUrl(mediaId) {
    const url = `https://graph.facebook.com/v22.0/${mediaId}`;
    return new Promise((resolve, reject) => {
      const options = {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      };

      const req = https.request(url, options, (res) => {
        let rawData = "";
        res.setEncoding("utf8");

        res.on("data", (chunk) => {
          rawData += chunk;
        });

        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(rawData));
            } catch (e) {
              reject(new Error(`Error parsing JSON response: ${e.message} - ${rawData}`));
            }
          } else {
            reject(new Error(`HTTP Error: ${res.statusCode} - ${rawData}`));
          }
        });
      });

      req.on("error", (e) => {
        reject(new Error(`Problem with request: ${e.message}`));
      });

      req.end();
    });
  }

  async downloadMedia(mediaUrl, outputPath) {
    return new Promise((resolve, reject) => {
      if (!outputPath) {
        return reject(new Error("Output path is required to save the media."));
      }

      const options = {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      };

      const req = https.request(mediaUrl, options, (res) => { // res will be used for headers
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const chunks = [];
          res.on("data", (chunk) => {
            chunks.push(chunk);
          });

          res.on("end", () => {
            const buffer = Buffer.concat(chunks);
            const outputDir = path.dirname(outputPath);
            fs.mkdir(outputDir, { recursive: true }, (mkdirErr) => {
              if (mkdirErr) {
                return reject(new Error(`Error creating directory ${outputDir}: ${mkdirErr.message}`));
              }

              fs.writeFile(outputPath, buffer, (writeErr) => {
                if (writeErr) {
                  return reject(new Error(`Error saving media to ${outputPath}: ${writeErr.message}`));
                }

                let posterFilePath = null;
                let posterMessage = "";
                const contentType = res.headers['content-type'];

                if (contentType && contentType.startsWith('video/')) {
                  posterFilePath = path.join(path.dirname(outputPath), path.parse(outputPath).name + ".jpg");
                  try {
                    // Ensure outputPath and posterFilePath are correctly quoted for the shell
                    const ffmpegCommand = `ffmpeg -i "${outputPath}" -ss 00:00:01.000 -vframes 1 -q:v 2 "${posterFilePath}" -y -hide_banner -loglevel error`;
                    execSync(ffmpegCommand);
                    posterMessage = `Poster image created at ${posterFilePath}.`;
                  } catch (ffmpegErr) {
                    console.warn(`[WspAPI] Failed to create poster for ${outputPath}: ${ffmpegErr.message}. Ensure ffmpeg is installed and in PATH.`);
                    posterMessage = `Failed to create poster: ${ffmpegErr.message}. (ffmpeg required)`;
                    posterFilePath = null; // Reset if creation failed
                  }
                }

                resolve({
                  status: "success",
                  code: 200,
                  message: `Media downloaded and saved to ${outputPath}. ${posterMessage}`.trim(),
                  data: {
                    buffer: buffer, 
                    filePath: outputPath,
                    posterPath: posterFilePath,
                  },
                  error: null,
                });
              });
            });
          });
        } else {
          let rawData = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            rawData += chunk;
          });
          res.on("end", () => {
            reject(new Error(`HTTP Error: ${res.statusCode} - ${rawData}`));
          });
        }
      });

      req.on("error", (e) => {
        reject(new Error(`Problem with request: ${e.message}`));
      });

      req.end();
    });
  }
}

exports.WspAPI = WspAPI;

// // Ejemplo de uso:
// const wspAPI = new WspAPI('<access token>');
// wspAPI
//   .sendMessage('56961719059', 'a text message')
//   .then((response) => {
//     console.log('Message sent successfully:', response);
//   })
//   .catch((error) => {
//     console.error('Error sending message:', error);
//   });