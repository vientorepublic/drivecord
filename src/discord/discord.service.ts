import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Client, GatewayIntentBits, TextChannel } from 'discord.js';
import { config } from '../config';

@Injectable()
export class DiscordService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscordService.name);
  private readonly client: Client;
  private ready = false;

  constructor() {
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    });
  }

  async onModuleInit(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.client.once('clientReady', (c) => {
        this.ready = true;
        this.logger.log(`Discord connected as ${c.user.tag}`);
        resolve();
      });
      this.client.login(config.token).catch(reject);
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.client.destroy();
    this.logger.log('Discord client destroyed');
  }

  getClient(): Client {
    if (!this.ready) throw new Error('Discord client is not ready yet');
    return this.client;
  }

  async fetchTextChannel(channelId: string): Promise<TextChannel> {
    const channel = await this.getClient().channels.fetch(channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      throw new Error(`Channel ${channelId} is not a text channel or was not found`);
    }
    return channel;
  }
}
