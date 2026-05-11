let io = null;

function setIo(instance) {
  io = instance;
}

function getIo() {
  return io;
}

function emitToAccount(accountId, eventName, payload) {
  if (io) {
    io.to(`account:${accountId}`).emit(eventName, payload);
  }
}

function emitToRole(role, eventName, payload) {
  if (io) {
    io.to(`role:${role}`).emit(eventName, payload);
  }
}

module.exports = {
  setIo,
  getIo,
  emitToAccount,
  emitToRole
};
