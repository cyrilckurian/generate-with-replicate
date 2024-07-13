import Replicate from 'replicate';
import axios from 'axios';
import fs from 'fs';
import { Client, Storage, Databases } from 'node-appwrite';
import { getStaticFile, throwIfMissing } from './utils.js';

export default async ({ req, res, log, error }) => {
  throwIfMissing(process.env, ['REPLICATE_API_TOKEN', 'APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY', 'APPWRITE_BUCKET_ID', 'APPWRITE_DATABASE_ID', 'APPWRITE_COLLECTION_ID']);

  if (req.method === 'GET') {
    return res.send(getStaticFile('index.html'), 200, {
      'Content-Type': 'text/html; charset=utf-8',
    });
  }

  const models = {
    audio:
      'meta/musicgen:b05b1dff1d8c6dc63d14b0cdb42135378dcb87f6373b0d3d341ede46e59e2b38',
    text: 'meta/llama-2-70b-chat',
    image:
      'konieshadow/fooocus-api:fda927242b1db6affa1ece4f54c37f19b964666bf23b0d06ae2439067cd344a4',
  };

  if (!req.body.prompt || typeof req.body.prompt !== 'string') {
    return res.json(
      { ok: false, error: 'Missing required field `prompt`' },
      400
    );
  }

  if (
    req.body.type !== 'audio' &&
    req.body.type !== 'text' &&
    req.body.type !== 'image'
  ) {
    return res.json({ ok: false, error: 'Invalid field `type`' }, 400);
  }

  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  let request = {
    input: {
      prompt: req.body.prompt,
    },
  };

  // Allows you to tinker parameters for individual output types
  switch (req.body.type) {
    case 'audio':
      request.input = {
        ...request.input,
        length: 30,
      };
      break;
    case 'text':
      request.input = {
        ...request.input,
        max_new_tokens: 512,
      };
      break;
    case 'image':
      request.input = {
        ...request.input,
        width: 512,
        height: 512,
        negative_prompt: 'deformed, noisy, blurry, distorted',
      };
      break;
  }

  let response;

  try {
    response = await replicate.run(models[req.body.type], request);
  } catch (err) {
    error(err);

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
    log(imageUrl); // Log the image URL

    try {
      // Download the image
      const imageResponse = await axios({
        url: imageUrl,
        responseType: 'stream',
      });

      const path = `/tmp/image.jpg`; // Save the image temporarily

      const writer = fs.createWriteStream(path);
      imageResponse.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      // Upload the image to Appwrite storage
      const file = await storage.createFile(
        process.env.APPWRITE_BUCKET_ID, // Replace with your storage bucket ID
        'unique()', // Unique file ID
        fs.createReadStream(path)
      );

      // Save the file ID in the database
      const document = await databases.createDocument(
        process.env.APPWRITE_DATABASE_ID, // Replace with your database ID
        process.env.APPWRITE_COLLECTION_ID, // Replace with your collection ID
        'unique()', // Unique document ID
        { fileId: file.$id, prompt: req.body.prompt }
      );

      // Cleanup: Delete the temporary file
      fs.unlinkSync(path);

      response = { fileId: file.$id, documentId: document.$id };
    } catch (err) {
      error(err);
      return res.json({ ok: false, error: 'Failed to process image' }, 500);
    }
  } else if (req.body.type === 'text') {
    response = response.join('');
  }

  log(response);
  return res.json({ ok: true, response, type: req.body.type }, 200);
};
