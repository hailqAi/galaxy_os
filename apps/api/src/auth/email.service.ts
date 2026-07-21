import { Injectable } from '@nestjs/common';
import { connect as connectTcp, Socket } from 'node:net';
import { connect as connectTls, TLSSocket } from 'node:tls';
import { readEnvironment } from '../config/env';

@Injectable()
export class EmailService {
  static readonly captured: { to: string; subject: string; text: string }[] =
    [];

  async send(to: string, subject: string, text: string) {
    const env = readEnvironment();
    if (env.NODE_ENV === 'test') {
      EmailService.captured.push({ to, subject, text });
      return;
    }
    const socket = await new Promise<Socket | TLSSocket>((resolve, reject) => {
      const connected = () => resolve(client);
      const client = env.SMTP_SECURE
        ? connectTls({ host: env.SMTP_HOST, port: env.SMTP_PORT }, connected)
        : connectTcp({ host: env.SMTP_HOST, port: env.SMTP_PORT }, connected);
      client.once('error', reject);
    });
    const response = () =>
      new Promise<string>((resolve, reject) => {
        let buffer = '';
        const receive = (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\r\n').filter(Boolean);
          if (!lines.length || /^\d{3}-/.test(lines.at(-1)!)) return;
          socket.off('data', receive);
          const code = Number(lines.at(-1)!.slice(0, 3));
          if (code >= 400) reject(new Error(`SMTP rejected message (${code})`));
          else resolve(buffer);
        };
        socket.on('data', receive);
        socket.once('error', reject);
      });
    const command = async (value: string) => {
      const pending = response();
      socket.write(`${value}\r\n`);
      return pending;
    };
    await response();
    await command('EHLO galaxy-os');
    if (env.SMTP_USER)
      await command(
        `AUTH PLAIN ${Buffer.from(`\0${env.SMTP_USER}\0${env.SMTP_PASSWORD ?? ''}`).toString('base64')}`,
      );
    await command(`MAIL FROM:<${env.EMAIL_FROM}>`);
    await command(`RCPT TO:<${to}>`);
    await command('DATA');
    await command(
      `From: ${env.EMAIL_FROM}\r\nTo: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text.replace(/^\./gm, '..')}\r\n.`,
    );
    await command('QUIT');
    socket.end();
  }

  passwordReset(email: string, rawToken: string) {
    const link = `${readEnvironment().APP_BASE_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;
    return this.send(
      email,
      'Reset your Galaxy OS password',
      `Use this single-use link within 30 minutes:\n\n${link}`,
    );
  }

  passwordChanged(email: string) {
    return this.send(
      email,
      'Your Galaxy OS password changed',
      'Your Galaxy OS password was changed. Contact your administrator immediately if this was not you.',
    );
  }
}
