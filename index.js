const WebSocket = require('ws');
const http = require('http');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.resolve(__dirname, 'ip_to_uuid.json');
let ipToUUID = {};

// Load IP->UUID map from disk if it exists
try {
  if (fs.existsSync(DATA_FILE)) {
    ipToUUID = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    console.log('Loaded IP->UUID map from disk.');
  }
} catch (e) {
  console.error('Error loading IP->UUID data:', e);
}

// Save function to persist map to disk
function saveMap() {
  fs.writeFile(DATA_FILE, JSON.stringify(ipToUUID, null, 2), (err) => {
    if (err) console.error('Failed to save IP->UUID map:', err);
  });
}

const port = process.env.PORT || 10000; // Render sets this
const server = http.createServer((req, res) => {
  // Simple health check endpoint
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('WebSocket server is running.\n');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;

  if (!ipToUUID[ip]) {
    ipToUUID[ip] = randomUUID();
    saveMap();
    console.log(`New IP assigned UUID: ${ip} → ${ipToUUID[ip]}`);
  }

  const clientId = ipToUUID[ip];
  console.log(`Client connected: ${clientId} (IP: ${ip})`);

  ws.on('message', (data, isBinary) => {
    const message = isBinary ? data.toString() : data.toString('utf8');

    // Broadcast JSON string with {from, message}
    const payload = JSON.stringify({
      from: clientId,
      message
    });

    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  });

  ws.on('close', () => {
    console.log(`Client disconnected: ${clientId} (IP: ${ip})`);
  });

  ws.on('error', (err) => {
    console.error(`Error from client ${clientId}:`, err);
  });
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
