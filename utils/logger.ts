import pino from "pino";

const transport = pino.transport({
  target: 'pino-pretty',
  options: { 
    destination: "./app.log",
    // We need to turn colorize off to get plain text logs.
    colorize: false,
  },
});

export const logger = pino({
  level: 'info',
  redact: ['poolKeys'],
  serializers: {
    error: pino.stdSerializers.err
  },
  base: undefined
}, transport);