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

};
