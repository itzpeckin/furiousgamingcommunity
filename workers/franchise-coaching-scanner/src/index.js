import {DurableObject} from 'cloudflare:workers';
import {GatewayConnection} from './gateway.js';
export class DiscordLoadoutGateway extends DurableObject {
  constructor(ctx,env){super(ctx,env);this.gateway=new GatewayConnection(ctx,env);}
  start(){return this.gateway.start();}
  alarm(){return this.gateway.alarm();}
}
export {default} from './scheduled.js';
