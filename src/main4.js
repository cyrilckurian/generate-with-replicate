import Replicate from 'replicate';
import { Client, Databases, ID } from 'appwrite';
import fetch from 'node-fetch'; // Ensure node-fetch is installed
import { getStaticFile, throwIfMissing } from './utils.js';

// Function to fetch an image from a URL and convert it to a Base64 string
async function fetchImageToBase64(url) {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Network response was not ok ' + response.statusText);
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    const base64String = imageBuffer.toString('base64');

    return base64String;
  } catch (error) {
    console.error('There was a problem with the fetch operation:', error);
    throw error;
  }
}

// Function to save Base64 string to Appwrite database
async function saveBase64ToAppwrite(base64String) {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT) // Your Appwrite endpoint
    .setProject(process.env.APPWRITE_PROJECT_ID); // Your Appwrite project ID

  const databases = new Databases(client);

  try {
    const response = await databases.createDocument(
      process.env.APPWRITE_DATABASE_ID, // Your database ID
      process.env.APPWRITE_COLLECTION_ID, // Your collection ID
      ID.unique(), // Generate a unique document ID
      { image: base64String } // Document data
    );
    console.log('Document created:', response);
  } catch (error) {
    console.error('Error saving document to Appwrite:', error);
  }
}

export default async ({ req, res, log, error }) => {
  throwIfMissing(process.env, ['REPLICATE_API_TOKEN']);

  if (req.method === 'GET') {
    return res.send(getStaticFile('index.html'), 200, {
      'Content-Type': 'text/html; charset=utf-8',
    });
  }

  const models = {
    audio: 'meta/musicgen:b05b1dff1d8c6dc63d14b0cdb42135378dcb87f6373b0d3d341ede46e59e2b38',
    text: 'meta/llama-2-70b-chat',
    image: 'konieshadow/fooocus-api:fda927242b1db6affa1ece4f54c37f19b964666bf23b0d06ae2439067cd344a4',
  };

  if (!req.body.prompt || typeof req.body.prompt !== 'string') {
    return res.json({ ok: false, error: 'Missing required field `prompt`' }, 400);
  }

  if (req.body.type !== 'audio' && req.body.type !== 'text' && req.body.type !== 'image') {
    return res.json({ ok: false, error: 'Invalid field `type`' }, 400);
  }

  const replicate = new Replicate();

  let request = {
    input: {
      prompt: req.body.prompt,
    },
  };

  switch (req.body.type) {
    case 'audio':
      request.input = { ...request.input, length: 30 };
      break;
    case 'text':
      request.input = { ...request.input, max_new_tokens: 512 };
      break;
    case 'image':
      request.input = { ...request.input, width: 512, height: 512, negative_prompt: 'deformed, noisy, blurry, distorted' };
      break;
  }

  let response;

  try {
    response = await replicate.run(models[req.body.type], request);
  } catch (err) {
    error(err);
    return res.json({ ok: false, error: 'Failed to run model' }, 500);
  }

  if (req.body.type === 'image') {
    response = response[0];
  } else if (req.body.type === 'text') {
    response = response.join('');
  }

  log(response);

  if (req.body.type === 'image') {
    try {
      const base64String = await fetchImageToBase64(response);
      await saveBase64ToAppwrite(base64String);
      return res.json({ ok: true, response, type: req.body.type }, 200);
    } catch (err) {
      error(err);
      return res.json({ ok: false, error: 'Failed to save image to Appwrite' }, 500);
    }
  } else {
    return res.json({ ok: true, response, type: req.body.type }, 200);
  }
};
