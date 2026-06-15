/**
 * wxpay 平台证书轮换单测
 *
 * 覆盖：
 * - registerPlatformCert 解析证书序列号（大写 hex，与 Wechatpay-Serial 对齐）
 */
import { describe, it, expect } from 'vitest';
import { registerPlatformCert } from '../../../src/modules/wxpay/wxpay.service.js';

// 自签测试证书（openssl 生成），其序列号固定如下
const TEST_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIC/zCCAeegAwIBAgIUZuloC8xuGIWWKZuYGr+MQA/SvH0wDQYJKoZIhvcNAQEL
BQAwDzENMAsGA1UEAwwEdGVzdDAeFw0yNjA2MTQwODUxNDlaFw0zNjA2MTEwODUx
NDlaMA8xDTALBgNVBAMMBHRlc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEK
AoIBAQCpwSYZycaOIlFJRB/wtAw0SnF2xZF+CbwrHy+xAChPVss/jJdADxGqlUtn
ErCYpQOl3Hpb/94YO3nHGeByMWnK0C3igZiociCY9GSzLgtJXcKh4YqbVLTrI4Kk
FmY45+XWINCzWJ8FUr2gzjBwn/WiYT5PkYPYdV288QxJzK5Pm3qF8kp4LfG5jgoO
He7Fu4tqM+RB04BiP0nArXzBqG4R0tmF/2P0iGXXJCdVcX2HlruM/VPlLZY8NFDa
k+ChdQd/ApU1R+ZPqf1K45y/+urwtwoXEKdx+2pZmbPnmjk11vlJoKtTIlE42bA/
gCV2JQAPfNnPgaWBa+h3PB2NkAXxAgMBAAGjUzBRMB0GA1UdDgQWBBSlMHVtg2/z
Io4N0qBlUfpZOUh57zAfBgNVHSMEGDAWgBSlMHVtg2/zIo4N0qBlUfpZOUh57zAP
BgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQB0M0Tl8lALWdtRriYP
YRalkzcz6CdrdivSdhZwUOShopVT+TvewjRJN6PROij2dkmvce5pVZSm1cRQ9eYl
LvKvVde8UiKyeXl+guvh1Q73X8kUkiugYv9EwcpGG625RyaSH1yMLuLVRTJt/lI0
Kv9XF34IqeIvG7ddFVOXJgqEtAcjijDIB0tyQ7V2YbkRP4Y82NqdraCD+OofWI90
1/5z9PefPUuIShcJEGzU+XuLPPXWXTyN2xZl7Pp8Cz1uuF8hIgDdukc749Ug1L2t
ANlbo4VnX3hsJ8lShcK0pK1l2ifdOE5tSA12WdROOLRUmadlBMkoDaIgHeOmrJ3z
XKBW
-----END CERTIFICATE-----
`;

const EXPECTED_SERIAL = '66E9680BCC6E188596299B981ABF8C400FD2BC7D';

describe('wxpay platform cert rotation', () => {
  it('registerPlatformCert 返回证书序列号（大写 hex）', () => {
    const serial = registerPlatformCert(TEST_CERT_PEM);
    expect(serial).toBe(EXPECTED_SERIAL);
  });
});
