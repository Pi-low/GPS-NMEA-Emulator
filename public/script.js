let selectedCoords = [45.645851, 5.866758];
let pvtCoords = [null, null];
let svrCoords = [null, null];
let mrkUser = null;
let mrkServer = null;
let remoteStatus = 0;

const map = L.map('map').setView(selectedCoords, 13);
let mrkPvtCentre = null;
let mrkPvtZone = null;
let pvtRadius = null;
let pvtAngle = 0;
let flagAutopilot = null;
let pvtBar = null

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const socket = io();

function refreshButtons() {
  switch(remoteStatus)
  {
    case 1: // COM port open, not sending
      document.getElementById("openPort").disabled = true;
      document.getElementById("startSending").disabled = false;
      document.getElementById("stopSending").disabled = true;
      document.getElementById("closePort").disabled = false;
      break;
    case 2: // COM port open, sending
      document.getElementById("openPort").disabled = true;
      document.getElementById("startSending").disabled = true;
      document.getElementById("stopSending").disabled = false;
      document.getElementById("closePort").disabled = true;
      break;
    default: // COM port closed, not sending
      document.getElementById("openPort").disabled = false;
      document.getElementById("startSending").disabled = true;
      document.getElementById("stopSending").disabled = true;
      document.getElementById("closePort").disabled = true;
      break;
  }
}

function refreshPivot() {
  if (map) {
    if (mrkPvtCentre && mrkPvtZone && map.hasLayer(mrkPvtCentre) && map.hasLayer(mrkPvtZone)) {
      mrkPvtCentre.setLatLng(pvtCoords);
      mrkPvtZone.setLatLng(pvtCoords);
      mrkPvtZone.setRadius(pvtRadius);
    }
    else {
      mrkPvtCentre = L.circle(pvtCoords, {
        radius: 2,
        color: 'red'}).addTo(map);
      mrkPvtZone = L.circle(pvtCoords, {
        radius: pvtRadius,
        color:'#00aeff',
        title:'Pivot center'}).addTo(map);
    }
  }
}

function updateAngleDisplay(toSetAngle) {
  document.getElementById('angle').innerText = `Angle: ${toSetAngle.toFixed(1)}°`;
}

fetch('api/status', { method: 'GET' })
  .then(res => res.json())
  .then(data => {
    if (data.coords) {
      selectedCoords = data.coords;
      map.setView(selectedCoords, 20);
      mrkUser = L.marker(selectedCoords).addTo(map);
      document.getElementById('coords').innerText = `${selectedCoords[0].toFixed(6)}, ${selectedCoords[1].toFixed(6)}`;
    }
    if (data.pivotCenter && data.pivotRadius) {
        pvtRadius = data.pivotRadius;
        pvtCoords = data.pivotCenter;
        refreshPivot();
        document.getElementById('center-coords').value = `${pvtCoords[0].toFixed(6)}, ${pvtCoords[1].toFixed(6)}`;
        document.getElementById('pivot-radius').value = pvtRadius;
        
    }
    flagAutopilot = data.autopilot;
    document.getElementById('speed').value = data.speed;
    document.getElementById('autopilot').checked = flagAutopilot;
    remoteStatus = data.status;
    refreshButtons();
  });

function updateServerMarker() {
  if (flagAutopilot) {
    if (pvtBar) {
      pvtBar.setLatLngs([pvtCoords, svrCoords]);
    } else {
      pvtBar = L.polyline([pvtCoords, svrCoords], { color: 'red', weight: 3 }).addTo(map);
    }
  } else {
    if (mrkServer) {
      mrkServer.setLatLng(svrCoords);
    } else {
      mrkServer = L.circle(svrCoords, { radius: 5, color: 'red' }).addTo(map);
    }
  }
}

socket.on('gpsData', (msg) => {
  console.log('Received: position[%f, %f]', msg.servPos[0], msg.servPos[1])
  svrCoords = msg.servPos;
  pvtAngle = msg.angle;
  updateServerMarker();
});

map.on('click', function (e) {
  selectedCoords = [e.latlng.lat, e.latlng.lng];
  if (mrkUser) {
    mrkUser.setLatLng(e.latlng);
  }
  else {
    mrkUser = L.marker(e.latlng).addTo(map);
  }
  document.getElementById('coords').innerText = `${selectedCoords[0].toFixed(6)}, ${selectedCoords[1].toFixed(6)}`;
  fetch('/api/update-coordinates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPos: selectedCoords }),
  });
});

async function loadPorts() {
  const res = await fetch('/api/ports');
  const ports = await res.json();
  const select = document.getElementById('ports');
  select.innerHTML = '';
  ports.forEach(p => {
    const option = document.createElement('option');
    option.value = p;
    option.textContent = p;
    select.appendChild(option);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadPorts();
  refreshButtons();
  
  document.getElementById('openPort').addEventListener('click', async () => {
    const port = document.getElementById('ports').value;
    const baud = document.getElementById('baud').value;

    const res = await fetch('/api/open-port', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portPath: port, baudRate: baud })
    });

    const data = await res.json();
    if (data.success) {
      remoteStatus = 1;
      refreshButtons();
    }
  });

  document.getElementById('startSending').addEventListener('click', async () => {
    const res = await fetch('/api/start-sending', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPos: selectedCoords })
    });
    const data = await res.json();
    if (data.started)
    { 
      remoteStatus = 2;
      refreshButtons();
    }
  });

  document.getElementById('stopSending').addEventListener('click', async () => {
    const res = await fetch('/api/stop-sending', { method: 'POST' });
    const data = await res.json();
    if (data.stopped)
    {
      remoteStatus = 1;
      refreshButtons();
    }
  });

  document.getElementById('closePort').addEventListener('click', async () => {
    const res = await fetch('/api/close-port', { method: 'POST' });
    const data = await res.json();
    if (data.closed)
    {
      remoteStatus = 0;
      refreshButtons();
    }
  });

  document.getElementById('set-center').addEventListener('click', async() => {
    const rad = Number(document.getElementById('pivot-radius').value);
    const stringCoords = document.getElementById('center-coords').value;
    const initSpeed = Number(document.getElementById('speed').value);
    if (stringCoords)
    {
        const parts = stringCoords.split(',');
        pvtCoords[0] = parseFloat(parts[0].trim());
        pvtCoords[1] = parseFloat(parts[1].trim());
    }
    else
    {
        pvtCoords = selectedCoords;
        document.getElementById('center-coords').value = `${selectedCoords[0].toFixed(6)}, ${selectedCoords[1].toFixed(6)}`;
    }
    if (rad)
    {
        pvtRadius = rad;
        refreshPivot();
        const res = await fetch('/api/update-pivot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ center: pvtCoords, rad: pvtRadius, speed: initSpeed})
        });
        const data = await res.json();
        if (data.pvtUpdate == false)
        {
            console.log('[WARNING] Pivot data not updated !!');
        }
    }
  });

  document.getElementById('remove').addEventListener('click', async() => {
    if (map && mrkPvtCentre && mrkPvtZone && map.hasLayer(mrkPvtCentre) && map.hasLayer(mrkPvtZone)) {
        mrkPvtCentre.remove();
        mrkPvtZone.remove();
        pvtCoords = [null, null];
        pvtRadius = null;
        console.log('Pivot marker removed');
        document.getElementById('center-coords').value = ``;
         const res = await fetch('/api/update-pivot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ center: pvtCoords, rad: pvtRadius, speed: 1})
        });
        const data = await res.json();
        if (data.pvtUpdate == false)
        {
            console.log('[WARNING] Pivot data not updated !!');
        }
    }
  });

  document.getElementById('autopilot').addEventListener('change', async() => {
    if (remoteStatus == 2) {
      if (document.getElementById('autopilot').checked) {
        console.log('Autopilot ON');
        socket.emit('do', {autopilot: true});
        flagAutopilot = true;
        if (map.hasLayer(mrkServer)) {
          mrkServer.remove();
          mrkServer = null;
        }
      }
      else {
        console.log('Autopilot OFF');
        socket.emit('do', {autopilot: false});
        flagAutopilot = false;
        if (map.hasLayer(pvtBar)) {
          map.removeLayer(pvtBar);
          pvtBar = null;
        }
      }
    }
    else {
      console.log('Autopilot unavailable');
    }
  });

   document.getElementById('speed').addEventListener('change', async() => {
    if (remoteStatus == 2)
    {
      const sendSpeed = Number(document.getElementById('speed').value);
      socket.emit('do', {speed: sendSpeed});
      console.log('set speed to %d °/min', sendSpeed);
    }
   });

});