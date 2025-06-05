import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { SerialPort } from 'serialport';
import { pointOnCircle } from './utils.js';
import { generateGGA } from './utils.js';
import { angleFromNorth } from './utils.js';
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
let clientPos = null;
let pvtCentrePos = null;
let pvtRad = null;
let skConn = [];
let autoMode = 0;
let simuSpeed = 1;

let targetAngle = 0;
let currAngle = 0;
let progressRate = 1/60; //in ° per sec
let sendPos = null;
let flagNewCoords = false;

io.on('connection', (socket) => {
  skConn.push(socket);
  console.log('socket connection');

  socket.on('do', (data) => {
    if (data.autopilot != null) {
      console.log('autopilot: %d', data.autopilot);
      autoMode = data.autopilot;
    }
    else if (data.speed != null) {
      console.log('set speed to %d', data.speed);
      progressRate = data.speed/60;
      simuSpeed = data.speed;
    }
  });

  io.on('disconnect', (socket) => {
    skConn = skConn.filter(s => s !== socket);
    console.log('socket disconnect');
  });
});

function sendToSockets(event, data) {
  skConn.forEach(socket => {
    if (socket.connected) {
      socket.emit(event, data);
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
      autopilot : autoMode,
      coords : clientPos,
      pivotCenter : pvtCentrePos,
      pivotRadius : pvtRad,
      speed: simuSpeed
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

let pvtActualAngle = 0;

app.post('/api/start-sending', (req, res) => {
  const { currentPos } = req.body;
  clientPos = currentPos;

  if (!serialPort || !serialPort.isOpen) {
    return res.status(400).json({ error: 'Serial port not open' });
  }
  CurrStatus = 2;
  if (pvtCentrePos) {
    targetAngle = angleFromNorth(pvtCentrePos, clientPos);
    console.log('target angle: %f°', targetAngle);
  }
  clearInterval(intervalId);
  intervalId = setInterval(() => {
    if (autoMode) {
      if (sendPos) {
        currAngle = angleFromNorth(pvtCentrePos, sendPos);
        if ((targetAngle > currAngle) && ((targetAngle - currAngle) > 180)) { 
          sendPos = pointOnCircle(pvtCentrePos, pvtRad, currAngle - progressRate);
        }
        else if (targetAngle < currAngle && ((currAngle - targetAngle) > 180)) { 
          sendPos = pointOnCircle(pvtCentrePos, pvtRad, currAngle + progressRate);
        }
        else if (targetAngle > currAngle) {
          sendPos = pointOnCircle(pvtCentrePos, pvtRad, currAngle + progressRate);
        }
        else if (targetAngle < currAngle){
          sendPos = pointOnCircle(pvtCentrePos, pvtRad, currAngle - progressRate);
        }
      }
    }
    else {
      sendPos = clientPos;
    }
    if (sendPos) {
      if (pvtCentrePos)
        pvtActualAngle = angleFromNorth(pvtCentrePos, sendPos);
      else
        pvtActualAngle = 0;
      const gga = generateGGA(sendPos[0], sendPos[1]);
      serialPort.write(gga + '\r\n');
      console.log('Sent:', gga);
      sendToSockets('gpsData', { servPos: sendPos, angle: pvtActualAngle});
    }
  }, 1000);
  res.json({ started: true });
});

app.post('/api/update-coordinates', (req, res) => {
  const { currentPos } = req.body;
  if (currentPos) {
    clientPos = currentPos;
    res.json({ updated: true });
    if (pvtCentrePos) {
      targetAngle = angleFromNorth(pvtCentrePos, clientPos);
      console.log('target angle: %f°', targetAngle);
      flagNewCoords = true;
    }
  }
  else {
    res.json({ updated: false });
  }
    
});

app.post('/api/update-pivot', (req, res) => {
  const { center, rad, speed } = req.body;
  if (center && rad && speed) {
    pvtCentrePos = center;
    pvtRad = rad;
    simuSpeed = speed;
    res.json({pvtUpdate: true});
    console.log('Set pivot of %d at [%f, %f]', pvtRad, pvtCentrePos[0].toFixed(6), pvtCentrePos[1].toFixed(6));
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

httpSvr.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});