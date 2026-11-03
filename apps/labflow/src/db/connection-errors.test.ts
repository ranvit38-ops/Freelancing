import { describe, expect, it } from 'vitest';
import { isConnectFailure } from './connection-errors';

describe('isConnectFailure', () => {
  it('retries failures that happened before anything was sent', () => {
    expect(isConnectFailure({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' })).toBe(true);
    expect(isConnectFailure({ code: '57P03', message: 'the database system is starting up' })).toBe(true);
    expect(isConnectFailure(new Error('timeout exceeded when trying to connect'))).toBe(true);
    expect(isConnectFailure(new Error("Couldn't connect to compute node"))).toBe(true);
  });

  it('never retries something that may already have run', () => {
    expect(isConnectFailure(new Error('Connection terminated unexpectedly'))).toBe(false);
    expect(isConnectFailure({ code: '23505', message: 'duplicate key value' })).toBe(false);
    expect(isConnectFailure(null)).toBe(false);
    expect(isConnectFailure('ECONNREFUSED')).toBe(false);
  });
});
