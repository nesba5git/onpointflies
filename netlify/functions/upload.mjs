import { getUploadsStore, initBlobsContext } from './lib/db.mjs';
import { verifyAdmin, respond } from './lib/auth.mjs';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/csv',
  'application/json',
];

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return respond({}, 204);
  }

  try {
    initBlobsContext(event);

    const store = getUploadsStore();

    // GET with a key — serve the file publicly (no auth required)
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};

      if (params.key) {
        // Return the raw file — public access so images display on catalog/inventory
        const meta = await store.get('meta:' + params.key, { type: 'json' });
        if (!meta) return respond({ error: 'File not found' }, 404);

        const data = await store.get('file:' + params.key);
        if (!data) return respond({ error: 'File not found' }, 404);

        // Return as base64 encoded body
        const arrayBuf = await data.arrayBuffer();
        const base64 = Buffer.from(arrayBuf).toString('base64');

        return {
          statusCode: 200,
          headers: {
            'Content-Type': meta.contentType,
            'Cache-Control': 'public, max-age=31536000',
            'Access-Control-Allow-Origin': '*',
          },
          body: base64,
          isBase64Encoded: true,
        };
      }

      // List all files — requires admin role
      const user = await verifyAdmin(event);
      if (!user) return respond({ error: 'Unauthorized — admin access required' }, 403);

      const list = await store.get('file-index', { type: 'json' });
      return respond(list || []);
    }

    // All write operations require admin role
    const user = await verifyAdmin(event);
    if (!user) return respond({ error: 'Unauthorized — admin access required' }, 403);

    // POST — upload a file
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);

      if (!body.fileName || !body.contentType || !body.data) {
        return respond({ error: 'fileName, contentType, and data are required' }, 400);
      }

      if (!ALLOWED_TYPES.includes(body.contentType)) {
        return respond({ error: 'File type not allowed. Accepted: ' + ALLOWED_TYPES.join(', ') }, 400);
      }

      // Decode base64 data
      const buffer = Buffer.from(body.data, 'base64');

      if (buffer.length > MAX_FILE_SIZE) {
        return respond({ error: 'File too large. Maximum size is 5 MB.' }, 400);
      }

      // Generate a unique key
      const timestamp = Date.now();
      const safeName = body.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const key = timestamp + '-' + safeName;

      // Store the file binary
      await store.set('file:' + key, buffer);

      // Store metadata
      const meta = {
        key,
        fileName: body.fileName,
        contentType: body.contentType,
        size: buffer.length,
        uploadedBy: user.email || user.sub,
        uploadedAt: new Date().toISOString(),
        target: body.target || 'general', // 'catalog' or 'inventory' or 'general'
      };
      await store.setJSON('meta:' + key, meta);

      // Update the file index
      let index = (await store.get('file-index', { type: 'json' })) || [];
      index.push(meta);
      await store.setJSON('file-index', index);

      // The URL to access the file
      const fileUrl = '/api/upload?key=' + encodeURIComponent(key);

      return respond({ message: 'File uploaded', file: { ...meta, url: fileUrl } }, 201);
    }

    // DELETE — remove a file
    if (event.httpMethod === 'DELETE') {
      const params = event.queryStringParameters || {};
      if (!params.key) {
        return respond({ error: 'File key is required' }, 400);
      }

      await store.delete('file:' + params.key);
      await store.delete('meta:' + params.key);

      // Update the file index
      let index = (await store.get('file-index', { type: 'json' })) || [];
      index = index.filter((f) => f.key !== params.key);
      await store.setJSON('file-index', index);

      return respond({ message: 'File deleted', files: index });
    }

    return respond({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('Upload error:', err);
    return respond({ error: err.message }, 500);
  }
};
