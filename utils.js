export function pointOnCircle(center, radiusMeters, angleDegrees) {
  const [latCenter, lonCenter] = center;
  const R = 6371000; // Earth radius in meters

  const angleRad = (angleDegrees * Math.PI) / 180;
  const latRad = (latCenter * Math.PI) / 180;
  const lonRad = (lonCenter * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(latRad) * Math.cos(radiusMeters / R) +
    Math.cos(latRad) * Math.sin(radiusMeters / R) * Math.cos(angleRad)
  );

  const lon2 = lonRad + Math.atan2(
    Math.sin(angleRad) * Math.sin(radiusMeters / R) * Math.cos(latRad),
    Math.cos(radiusMeters / R) - Math.sin(latRad) * Math.sin(lat2)
  );

  return [
    (lat2 * 180) / Math.PI,
    (lon2 * 180) / Math.PI
  ];
}

export function angleFromNorth(center, point) {
  const [lat1, lon1] = center.map(deg => deg * Math.PI / 180);
  const [lat2, lon2] = point.map(deg => deg * Math.PI / 180);

  const dLon = lon2 - lon1;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  let angleRad = Math.atan2(y, x);
  let angleDeg = (angleRad * 180 / Math.PI + 360) % 360;

  return angleDeg;
}

export function generateGGA(lat, lon) {
  const now = new Date();
  const time = now.toISOString().substr(11, 8).replace(/:/g, '');

  function convertToNMEA(coord, isLat) {
    const abs = Math.abs(coord);
    const degrees = Math.floor(abs);
    const minutes = (abs - degrees) * 60;
    const pad = isLat ? 2 : 3;
    const dir = coord >= 0 ? (isLat ? 'N' : 'E') : (isLat ? 'S' : 'W');
    return `${degrees.toString().padStart(pad, '0')}${minutes.toFixed(4).padStart(6, '0')},${dir}`;
  }

  const nmeaLat = convertToNMEA(lat, true);
  const nmeaLon = convertToNMEA(lon, false);
  const raw = `GNGGA,${time}.000,${nmeaLat},${nmeaLon},1,10,2.0,230.1,M,46.9,M,,`;
  const checksum = raw.split('').reduce((a, c) => a ^ c.charCodeAt(0), 0).toString(16).toUpperCase();
  return `$${raw}*${checksum}`;
}
