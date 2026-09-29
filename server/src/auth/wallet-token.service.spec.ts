import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { WalletTokenService } from './wallet-token.service';

function build(path: string | undefined): WalletTokenService {
  const config = { get: () => path } as unknown as ConfigService;
  return new WalletTokenService(config, new JwtService());
}

describe('WalletTokenService boot safety (S8)', () => {
  it('is off, not crashed, when the key file is missing', () => {
    expect(build('/nonexistent/key.pem').isConfigured).toBe(false);
  });

  it('is off, not crashed, when the file is not a valid PEM', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'wt-')), 'bad.pem');
    writeFileSync(file, 'this is not a pem');
    expect(build(file).isConfigured).toBe(false);
  });

  it('is off when no path is configured', () => {
    expect(build(undefined).isConfigured).toBe(false);
  });
});
