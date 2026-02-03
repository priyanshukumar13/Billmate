const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    // Write all error logs to `error.log`
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    // Write all logs to `combined.log`
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// If we are not in production, also log to the console
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

module.exports = logger;