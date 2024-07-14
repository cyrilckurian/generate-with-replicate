import Replicate from 'replicate';
import { getStaticFile, throwIfMissing } from './utils.js';

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
    let prediction = await replicate.predictions.create({
      version: models[req.body.type],
      input: request.input,
    });

    // Wait for the prediction to complete
    while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      prediction = await replicate.predictions.get(prediction.id);
    }

    if (prediction.status === 'failed') {
      throw new Error('Prediction failed');
    }

    //response = prediction.output;
    response = prediction;
  } catch (err) {
    error(err);
    return res.json({ ok: false, error: 'Failed to run model' }, 500);
  }

  log(prediction);

  // Return the complete output object
  return res.json({ ok: true, response: prediction, type: req.body.type }, 200);
};
