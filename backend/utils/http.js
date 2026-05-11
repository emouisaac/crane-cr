function getIpAddress(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    "unknown"
  );
}

function getDeviceFingerprint(req) {
  return req.headers["x-device-fingerprint"] || "unknown-device";
}

module.exports = {
  getIpAddress,
  getDeviceFingerprint
};
