export * from './logger';
export * from './json-rpc-errors';

export function isProduction(): boolean {
  console.log('>process.env.NODE_ENV', process.env.NODE_ENV);
  return process.env.NODE_ENV === 'production';
}