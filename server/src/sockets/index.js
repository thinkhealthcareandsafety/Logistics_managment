const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const logger = require('../config/logger');

let io = null;

function userRoom(userId) {
  return `user:${userId}`;
}

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.clientUrl, credentials: true },
  });

  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) return next(new Error('Unauthorized'));
      const payload = jwt.verify(token, env.jwtSecret);
      socket.userId = payload.sub;
      next();
    } catch (err) {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(userRoom(socket.userId));
    logger.debug(`Socket connected for user ${socket.userId}`);

    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected for user ${socket.userId}`);
    });
  });

  return io;
}

/** Pushes a shipment status/checkpoint update to just the owning user's clients. */
function emitShipmentUpdate(userId, shipment) {
  if (!io) return;
  io.to(userRoom(userId)).emit('shipment:updated', shipment);
}

/** Pushes a new in-app notification to just that user's clients. */
function emitNotification(userId, notification) {
  if (!io) return;
  io.to(userRoom(userId)).emit('notification:new', notification);
}

module.exports = { initSocket, emitShipmentUpdate, emitNotification };
