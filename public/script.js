let selectedCoords = [45.645851, 5.866758];
let pivotCenter = [null, null];
let marker = null;
let circleLayer = null;
let arcLayer = null;
let remoteStatus = 0;

const map = L.map('map').setView(selectedCoords, 13);
let pvtMark = null;
let pvtDraw = null;
let pvtRadius = null;
let svrAutoPilot = 0;

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const socket = io('ws://localhost:65080');

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
        if (pvtMark && pvtDraw && map.hasLayer(pvtMark) && map.hasLayer(pvtDraw)) {
            pvtMark.setLatLng(pivotCenter);
            pvtDraw.setLatLng(pivotCenter);
            pvtDraw.setRadius(pvtRadius);
        }
        else {
            pvtMark = L.circleMarker(pivotCenter, {
              radius: 1,
              color: 'red'}).addTo(map);
            pvtDraw = L.circle(pivotCenter, {
              radius: pvtRadius,
              color:'#00aeff',
              title:'Pivot center'}).addTo(map);
        }
    }
}

fetch('api/status', { method: 'GET' })
  .then(res => res.json())
  .then(data => {
    if (data.coords
    && Array.isArray(data.coords)
    && (data.coords.length === 2)
    && (data.coords[0] !== null)
    && (data.coords[1] !== null)) {
      selectedCoords = data.coords;
      map.setView(selectedCoords, 20);
      marker = L.marker(selectedCoords).addTo(map);
      document.getElementById('coords').innerText =
        `${selectedCoords[0].toFixed(6)}, ${selectedCoords[1].toFixed(6)}`;
    }
    if (data.pivotCenter
    && Array.isArray(data.pivotCenter)
    && (data.pivotCenter.length === 2)
    && (data.pivotCenter[0] !== null)
    && (data.pivotCenter[1] !== null)
    && (data.pivotRadius != null)) {
        pvtRadius = data.pivotRadius;
        pivotCenter = data.pivotCenter;
        refreshPivot();
        document.getElementById('center-coords').value = `${pivotCenter[0].toFixed(6)}, ${pivotCenter[1].toFixed(6)}`;
        document.getElementById('pivot-radius').value = pvtRadius;
    }
    remoteStatus = data.status;
    refreshButtons();
  });

socket.on('data', (msg) => console.log('Received:', msg));

map.on('click', function (e) {
    if (svrAutoPilot == 0)
    {
        selectedCoords = [e.latlng.lat, e.latlng.lng];
        if (marker) {
          marker.setLatLng(e.latlng);
        }
        else {
          marker = L.marker(e.latlng).addTo(map);
        }
        document.getElementById('coords').innerText = `${selectedCoords[0].toFixed(6)}, ${selectedCoords[1].toFixed(6)}`;

        fetch('/api/update-coordinates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: selectedCoords[0], lon: selectedCoords[1] }),
        });
    }
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
      alert('Port opened successfully');
      remoteStatus = 1;
      refreshButtons();
    } else 
    { alert('Failed to open port'); }
  });

  document.getElementById('startSending').addEventListener('click', async () => {
    const res = await fetch('/api/start-sending', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: selectedCoords[0], lon: selectedCoords[1] })
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
    if (stringCoords)
    {
        const parts = stringCoords.split(',');
        pivotCenter[0] = parseFloat(parts[0].trim());
        pivotCenter[1] = parseFloat(parts[1].trim());
    }
    else
    {
        pivotCenter[0] = selectedCoords[0];
        pivotCenter[1] = selectedCoords[1];
        document.getElementById('center-coords').value = `${selectedCoords[0].toFixed(6)}, ${selectedCoords[1].toFixed(6)}`;
    }
    if (rad)
    {
        pvtRadius = rad;
        refreshPivot();
        const res = await fetch('/api/update-pivot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: pivotCenter[0], lon: pivotCenter[1], rad: pvtRadius})
        });
        const data = await res.json();
        if (data.pvtUpdate == false)
        {
            console.log('[WARNING] Pivot data not updated !!');
        }
    }
  });

  document.getElementById('remove').addEventListener('click', async() => {
    if (map && pvtMark && pvtDraw && map.hasLayer(pvtMark) && map.hasLayer(pvtDraw)) {
        pvtMark.remove();
        pvtDraw.remove();
        pivotCenter = [null, null];
        pvtRadius = null;
        console.log('Pivot markers removed');
        document.getElementById('center-coords').value = ``;
         const res = await fetch('/api/update-pivot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: pivotCenter[0], lon: pivotCenter[1], rad: pvtRadius})
        });
        const data = await res.json();
        if (data.pvtUpdate == false)
        {
            console.log('[WARNING] Pivot data not updated !!');
        }
    }
  });
});