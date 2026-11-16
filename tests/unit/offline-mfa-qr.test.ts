import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import { describe, expect, it } from 'vitest';

describe('offline MFA enrollment QR', () => {
  it('renders the provisioning URI as a self-contained SVG without network resources', () => {
    const provisioningUri =
      'otpauth://totp/Site%20Mapper%3Aoperator%40site-mapper.local?secret=JBSWY3DPEHPK3PXP&issuer=Site%20Mapper&algorithm=SHA1&digits=6&period=30';

    const markup = renderToStaticMarkup(
      createElement(QRCodeSVG, {
        value: provisioningUri,
        title: 'Authenticator setup',
        size: 224,
        level: 'M',
        marginSize: 4,
        bgColor: '#ffffff',
        fgColor: '#121923',
      }),
    );

    expect(markup).toContain('<svg');
    expect(markup).toContain('<path');
    expect(markup).toContain('<title>Authenticator setup</title>');
    expect(markup).not.toMatch(/<image|<img|<script|\s(?:href|src|xlink:href)=/i);
    expect(markup).not.toContain(provisioningUri);
  });
});
