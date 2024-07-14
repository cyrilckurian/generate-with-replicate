import Replicate from 'replicate';
import axios from 'axios';
import fs from 'fs';
import { Client, Storage, Databases } from 'node-appwrite';
import { getStaticFile, throwIfMissing } from './utils.js';

export default async ({ req, res, log, error }) => {
  throwIfMissing(process.env, [
    'REPLICATE_API_TOKEN',
    'APPWRITE_ENDPOINT',
    'APPWRITE_PROJECT_ID',
    'APPWRITE_API_KEY',
    'APPWRITE_BUCKET_ID',
    'APPWRITE_DATABASE_ID',
    'APPWRITE_COLLECTION_ID'
  ]);

  if (req.method === 'GET') {
    log('GET request received, serving static file');
    return res.send(getStaticFile('index.html'), 200, {
      'Content-Type': 'text/html; charset=utf-8',
    });
  }

  log('Received request:', req.body);

  const models = {
    image: 'konieshadow/fooocus-api:fda927242b1db6affa1ece4f54c37f19b964666bf23b0d06ae2439067cd344a4',
  };

  if (!req.body.prompt || typeof req.body.prompt !== 'string') {
    log('Invalid prompt:', req.body.prompt);
    return res.json({ ok: false, error: 'Missing required field `prompt`' }, 400);
  }

  if (req.body.type !== 'image') {
    log('Invalid type:', req.body.type);
    return res.json({ ok: false, error: 'Invalid field `type`' }, 400);
  }

  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  let request = {
    input: {
      prompt: req.body.prompt,
      width: 512,
      height: 512,
      negative_prompt: 'deformed, noisy, blurry, distorted',
    },
  };

  log('Requesting image from Replicate with input:', request.input);

  let response;

  try {
    response = await replicate.run(models[req.body.type], request);
    log('Replicate response:', response);
  } catch (err) {
    error('Error running model:', err);
    return res.json({ ok: false, error: 'Failed to run model' }, 500);
  }

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const storage = new Storage(client);
  const databases = new Databases(client);

  if (req.body.type === 'image') {
    const imageUrl = response[0];
    log('Image URL:', imageUrl);

    try {
      // Download the image
      log('Downloading image from URL:', imageUrl);
      const imageResponse = await axios({
        url: imageUrl,
        responseType: 'stream',
      });

      const path = `/tmp/image.jpg`; // Save the image temporarily
      log('Saving image temporarily at:', path);

      const writer = fs.createWriteStream(path);
      imageResponse.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      log('Image downloaded successfully');

      // Upload the image to Appwrite storage
      log('Uploading image to Appwrite storage');
      const file = await storage.createFile(
        process.env.APPWRITE_BUCKET_ID, // Replace with your storage bucket ID
        'unique()', // Unique file ID
        fs.createReadStream(path)
      );

      log('Image uploaded to Appwrite storage with file ID:', file.$id);

      // Save the file ID in the database
      log('Saving file ID to Appwrite database');
      const document = await databases.createDocument(
        process.env.APPWRITE_DATABASE_ID, // Replace with your database ID
        process.env.APPWRITE_COLLECTION_ID, // Replace with your collection ID
        'unique()', // Unique document ID
        { fileId: file.$id, prompt: req.body.prompt }
      );

      log('File ID saved to database with document ID:', document.$id);

      // Cleanup: Delete the temporary file
      fs.unlinkSync(path);
      log('Temporary image file deleted');

      response = { fileId: file.$id, documentId: document.$id };
    } catch (err) {
      error('Error processing image:', err);
      return res.json({ ok: false, error: 'Failed to process image' }, 500);
    }
  }

  log('Final response:', response);
  return res.json({ ok: true, response, type: req.body.type }, 200);
};
