import { Telegraf } from 'telegraf'
import Koa from 'koa'
import koaBody from 'koa-body'
import * as dotenv from 'dotenv'
import { v4 as uuidv4 } from 'uuid'
import logger from './logger'

dotenv.config()

const port = process.env.PORT || 3000

const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW = 15 * 60 * 1000 // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 100

const rateLimitMiddleware = async (ctx: any, next: () => Promise<void>) => {
  const ip = ctx.ip || ctx.request.ip
  const now = Date.now()
  
  const clientData = rateLimitMap.get(ip)
  
  if (!clientData || now > clientData.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    await next()
  } else if (clientData.count >= RATE_LIMIT_MAX_REQUESTS) {
    logger.warn('Rate limit exceeded', { ip, count: clientData.count })
    ctx.status = 429
    ctx.body = JSON.stringify({ error: 'Too many requests, please try again later' })
  } else {
    clientData.count++
    await next()
  }
}

const isMemberInChat = async (userId: number, groupChatId: number, bot: Telegraf): Promise<boolean> => {
  logger.debug('Checking if user is in chat', { userId, groupChatId })
  try {
    const chatMember = await bot.telegram.getChatMember(groupChatId, userId);
    const isMember = ['member', 'administrator', 'creator'].includes(chatMember.status);
    logger.debug('Chat membership check result', { userId, groupChatId, isMember, status: chatMember.status })
    return isMember;
  } catch (error) {
    logger.error('Error checking chat membership', { userId, groupChatId, error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

const isMemberInAnyChat = async (userId: number, groupChatIds: number[], bot: Telegraf): Promise<boolean> => {
  const allPromiseResults:boolean[] = await Promise.all(groupChatIds.map( (groupChatId) => {
    return isMemberInChat(userId, groupChatId, bot)
  }))
  return allPromiseResults.some( (result) => result )
}

const isBotInAllGroups = async (groupChatIds: number[], bot: Telegraf): Promise<boolean> => {
  logger.info('Checking if bot is in all groups', { groupChatIds })
  try {
    const botId = await bot.telegram.getMe().then((botInfo) => botInfo.id);
    const allPromiseResults: boolean[] = await Promise.all(groupChatIds.map(async (groupChatId) => {
      try {
        await bot.telegram.getChatMember(groupChatId, botId);
        return true;
      } catch (error) {
        logger.warn('Bot not found in group', { groupChatId, error: error instanceof Error ? error.message : String(error) });
        return false;
      }
    }));
    const isInAllGroups = allPromiseResults.every((result) => result);
    logger.info('Bot group membership check completed', { isInAllGroups, groupChatIds });
    return isInAllGroups;
  } catch (error) {
    logger.error('Error checking bot group membership', { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

const isValidUserId = (userId: any): userId is number => {
  return typeof userId === 'number' && Number.isInteger(userId) && userId > 0
}

if (process.env.TG_BOT_TOKEN) {
  logger.info('Bot token configured successfully')
  const app = new Koa()
  
  app.use(rateLimitMiddleware)
  
  app.use(koaBody())

  if (!process.env.TG_ADMIN_GROUP_IDS) {
    logger.error('No admin group ID provided')
    process.exit(1)
  } else if (!process.env.TG_ACTIVE_GROUP_IDS) {
    logger.error('No active group ID provided')
    process.exit(1)
  }
  
  logger.info('Configuration loaded', {
    adminGroups: process.env.TG_ADMIN_GROUP_IDS,
    activeGroups: process.env.TG_ACTIVE_GROUP_IDS
  })

  const adminGroups = process.env.TG_ADMIN_GROUP_IDS.split(',').map(id => parseInt(id))
  const activeGroups = process.env.TG_ACTIVE_GROUP_IDS.split(',').map(id => parseInt(id))
  
  const bot = new Telegraf(process.env.TG_BOT_TOKEN)
  
  const allGroups = adminGroups.concat(activeGroups)
  isBotInAllGroups(allGroups, bot).then((result) => {
    if (!result) {
      logger.error('Bot is not in all required groups', { allGroups })
      process.exit(1)
    }
  }).catch((error) => {
    logger.error('Failed to verify bot group membership', { error: error instanceof Error ? error.message : String(error) })
    process.exit(1)
  })

  app.use(async (ctx, next) => {
    if (ctx.path === '/health') {
      ctx.body = { status: 'healthy', timestamp: new Date().toISOString() }
      ctx.status = 200
      return
    }
    await next()
  })

  app.use(async (ctx) => {
    const startTime = Date.now()
    const requestId = uuidv4()
    
    logger.info('Incoming request', {
      requestId,
      method: ctx.method,
      path: ctx.path,
      ip: ctx.ip,
      userAgent: ctx.get('User-Agent')
    })

    if ((ctx.request as any).body && (ctx.request as any).body.user) {
      const userId = (ctx.request as any).body.user
      
      // Input validation
      if (!isValidUserId(userId)) {
        logger.warn('Invalid user ID provided', { requestId, userId })
        ctx.body = JSON.stringify({ error: 'Invalid user ID' })
        ctx.status = 400
        return
      }

      try {
        let role: string
        if (await isMemberInAnyChat(userId, adminGroups, bot)) {
          role = 'admin'
        } else if (await isMemberInAnyChat(userId, activeGroups, bot)) {
          role = 'active'
        } else {
          role = 'nakki'
        }
        
        const responseTime = Date.now() - startTime
        logger.info('Request processed successfully', {
          requestId,
          userId,
          role,
          responseTime
        })
        
        ctx.body = JSON.stringify({ role })
      } catch (error) {
        const responseTime = Date.now() - startTime
        logger.error('Error processing request', {
          requestId,
          userId,
          error: error instanceof Error ? error.message : String(error),
          responseTime
        })
        ctx.body = JSON.stringify({ error: 'Internal server error' })
        ctx.status = 500
      }
    } else {
      logger.warn('Request missing user ID', { requestId })
      ctx.body = JSON.stringify({ error: 'No user ID provided' })
      ctx.status = 400
    }
  })

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));

  app.listen(port, () => {
    logger.info('Server started successfully', { port, environment: process.env.NODE_ENV || 'development' })
  })

} else {
  logger.error('No bot token provided in environment variables')
  process.exit(1)
}

