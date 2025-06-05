import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { SerialPort } from 'serialport';
import { pointOnCircle } from './utils.js';
import { generateGGA } from './utils.js';
import { createServer } from "http";
import { Server } from 'socket.io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 8080;

const httpSvr = createServer(app);
const io = new Server(httpSvr, {
  cors: {
    origin: '*',
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

let serialPort = null;
let intervalId = null;
let CurrStatus = 0;
let currentLat = null;
let currentLon = null;
let pvtLat = null;
let pvtLon = null;
let pvtRad = null;
let skConn = [];

io.on('connection', (socket) => {
  skConn.push(socket);
  console.log('socket connection');
});

io.on('disconnect', (socket) => {
  skConn = skConn.filter(s => s !== socket);
  console.log('socket disconnect');
});

function sendToSockets(event, data) {
  skConn.forEach(socket => {
    if (socket.connected) {
      socket.emit(event, data);
    } else {
      console.log('Socket not connected, skipping emit:', event);
    }
  });
}

app.get('/api/ports', async (req, res) => {
  try {
    const ports = await SerialPort.list();
    res.json(ports.map(p => p.path));
  } catch (err) {
    console.error('Failed to list ports:', err);
    res.status(500).json({ error: 'Failed to list ports' });
  }
});

app.get('/api/status', async (req, res) => {
  try {
    res.json({
      status : CurrStatus,
      coords : [currentLat, currentLon],
      pivotCenter : [pvtLat, pvtLon],
      pivotRadius : pvtRad
    });
  } catch (err) {
    console.error('Fail to send status:', err);
    res.status(500).json({ error: 'Failed to send status' });
  }
});

app.post('/api/open-port', (req, res) => {
  const { portPath, baudRate } = req.body;

  if (serialPort && serialPort.isOpen) {
    serialPort.close();
  }

  serialPort = new SerialPort({
    path: portPath,
    baudRate: parseInt(baudRate),
    dataBits: 8,
    parity: 'none',
    stopBits: 1
  });

  serialPort.on('open', () => {
    console.log(`Port ${portPath} opened at ${baudRate} baud`);
    CurrStatus = 1;
    res.json({ success: true });
  });

  serialPort.on('error', (err) => {
    console.error('Serial port error:', err);
    CurrStatus = 0;
    res.status(500).json({ error: err.message });
  });
});

app.post('/api/start-sending', (req, res) => {
  const { lat, lon } = req.body;
  currentLat = lat;
  currentLon = lon;

  if (!serialPort || !serialPort.isOpen) {
    return res.status(400).json({ error: 'Serial port not open' });
  }
  CurrStatus = 2;
  clearInterval(intervalId);
  intervalId = setInterval(() => {
    if (currentLat !== null && currentLon !== null) {
      const gga = generateGGA(currentLat, currentLon);
      serialPort.write(gga + '\r\n');
      console.log('Sent:', gga);
      sendToSockets('gpsData', { lat: currentLat, lon: currentLon, gga });
    }
  }, 1000);
  res.json({ started: true });
});

app.post('/api/update-coordinates', (req, res) => {
  const { lat, lon } = req.body;
  currentLat = lat;
  currentLon = lon;
  res.json({ updated: true });
});

app.post('/api/update-pivot', (req, res) => {
  const { lat, lon, rad } = req.body;
  if (lat && lon && rad) {
    pvtLat = lat;
    pvtLon = lon;
    pvtRad = rad;
    res.json({pvtUpdate: true});
    console.log('Set pivot of %d at %f, %f', pvtRad, pvtLat.toFixed(6), pvtLon.toFixed(6));
  }
  else {
    res.json({pvtUpdate: false});
  }
});

app.post('/api/stop-sending', (req, res) => {
  clearInterval(intervalId);
  CurrStatus = 1;
  res.json({ stopped: true });
});

app.post('/api/close-port', (req, res) => {
  if (serialPort && serialPort.isOpen) {
    serialPort.close((err) => {
      if (err) {
        console.error('Error closing port:', err);
        return res.status(500).json({ error: 'Failed to close port' });
      }
      console.log('Serial port closed');
      CurrStatus = 0;
      return res.json({ closed: true });
    });
  } else {
    return res.json({ closed: true });
  }
});




// httpSvr.listen(WSPORT);
httpSvr.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});